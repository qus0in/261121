import { extractText, getDocumentProxy } from "unpdf";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { cosineDistance, desc, eq, sql } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import { chunks, documents, EMBED_DIM } from "./db/schema";

const EMBED_MODEL = "gemini-embedding-2";
type Db = NeonHttpDatabase<Record<string, never>>;

/** Gemini embedding REST (batch). outputDimensionality keeps vectors at EMBED_DIM. */
async function embed(apiKey: string, texts: string[], taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY") {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += 50) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:batchEmbedContents`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          requests: texts.slice(i, i + 50).map((text) => ({
            model: `models/${EMBED_MODEL}`,
            content: { parts: [{ text }] },
            taskType,
            outputDimensionality: EMBED_DIM,
          })),
        }),
      },
    );
    if (!res.ok) throw new Error(`embedding failed: ${res.status} ${await res.text()}`);
    const json = (await res.json()) as { embeddings: { values: number[] }[] };
    out.push(...json.embeddings.map((e) => normalize(e.values)));
  }
  return out;
}

// Truncated (Matryoshka) vectors should be re-normalized.
const normalize = (v: number[]) => {
  const n = Math.hypot(...v) || 1;
  return v.map((x) => x / n);
};

/** ETL: Extract (pdf→pages) → Transform (clean + chunk + embed) → Load (pgvector). */
export async function ingestPdf(db: Db, apiKey: string, name: string, data: ArrayBuffer) {
  // Extract
  const pdf = await getDocumentProxy(new Uint8Array(data));
  const { text: pages } = await extractText(pdf, { mergePages: false });

  // Transform: chunk per page so every chunk keeps its page number
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 150,
    separators: ["\n\n", "\n", ". ", " ", ""],
  });
  const pieces: { page: number; content: string }[] = [];
  for (let p = 0; p < pages.length; p++) {
    const clean = pages[p].replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
    if (!clean) continue;
    for (const content of await splitter.splitText(clean)) {
      if (content.trim().length >= 20) pieces.push({ page: p + 1, content });
    }
  }
  if (!pieces.length) throw new Error("PDF에서 추출할 텍스트가 없습니다 (스캔본일 수 있습니다).");

  const vectors = await embed(apiKey, pieces.map((x) => x.content), "RETRIEVAL_DOCUMENT");

  // Load
  const [doc] = await db
    .insert(documents)
    .values({ name, pageCount: pages.length, chunkCount: pieces.length })
    .returning();
  try {
    const rows = pieces.map((x, idx) => ({ documentId: doc.id, page: x.page, idx, content: x.content, embedding: vectors[idx] }));
    for (let i = 0; i < rows.length; i += 100) await db.insert(chunks).values(rows.slice(i, i + 100));
  } catch (e) {
    await db.delete(documents).where(eq(documents.id, doc.id));
    throw e;
  }
  return doc;
}

export async function search(db: Db, apiKey: string, query: string, k = 5) {
  const [qv] = await embed(apiKey, [query], "RETRIEVAL_QUERY");
  const similarity = sql<number>`1 - (${cosineDistance(chunks.embedding, qv)})`;
  return db
    .select({ content: chunks.content, page: chunks.page, name: documents.name, similarity })
    .from(chunks)
    .innerJoin(documents, eq(chunks.documentId, documents.id))
    .orderBy(desc(similarity))
    .limit(k);
}
