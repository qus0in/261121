import { Hono } from "hono";
import { streamText } from "hono/streaming";
import { asc, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { documents, messages } from "./db/schema";
import { ingestPdf, search } from "./rag";

type Env = { Bindings: { GEMINI_API_KEY: string; NEON_CONNECTION_URL: string } };

const MIN_SIMILARITY = 0.4; // 이보다 낮은 청크는 컨텍스트에서 제외
const app = new Hono<Env>();
const getDb = (url: string) => drizzle(neon(url));

app.get("/api/messages", async (c) => {
  const db = getDb(c.env.NEON_CONNECTION_URL);
  const rows = await db.select().from(messages).orderBy(asc(messages.id));
  return c.json(rows.map(({ role, content }) => ({ role, content })));
});

app.delete("/api/messages", async (c) => {
  await getDb(c.env.NEON_CONNECTION_URL).delete(messages);
  return c.body(null, 204);
});

app.get("/api/documents", async (c) => {
  return c.json(await getDb(c.env.NEON_CONNECTION_URL).select().from(documents).orderBy(desc(documents.id)));
});

app.post("/api/documents", async (c) => {
  const file = (await c.req.formData()).get("file");
  if (!(file instanceof File)) return c.json({ error: "file 필드가 필요합니다" }, 400);
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) return c.json({ error: "PDF만 업로드할 수 있습니다" }, 400);
  if (file.size > 20 * 1024 * 1024) return c.json({ error: "20MB 이하만 가능합니다" }, 413);
  try {
    const doc = await ingestPdf(getDb(c.env.NEON_CONNECTION_URL), c.env.GEMINI_API_KEY, file.name, await file.arrayBuffer());
    return c.json(doc);
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : "처리 실패" }, 422);
  }
});

app.delete("/api/documents/:id", async (c) => {
  await getDb(c.env.NEON_CONNECTION_URL).delete(documents).where(eq(documents.id, Number(c.req.param("id"))));
  return c.body(null, 204);
});

app.post("/api/chat", async (c) => {
  const { content } = await c.req.json<{ content: string }>();
  const db = getDb(c.env.NEON_CONNECTION_URL);
  await db.insert(messages).values({ role: "user", content });
  const rows = await db.select().from(messages).orderBy(asc(messages.id));

  const model = new ChatGoogleGenerativeAI({
    apiKey: c.env.GEMINI_API_KEY,
    model: "gemini-3.5-flash-lite",
    streaming: true,
  });
  let context = "";
  let sources: { name: string; page: number; similarity: number }[] = [];
  try {
    const hits = (await search(db, c.env.GEMINI_API_KEY, content)).filter((h) => h.similarity >= MIN_SIMILARITY);
    sources = hits.map((h) => ({ name: h.name, page: h.page, similarity: Math.round(h.similarity * 100) / 100 }));
    if (hits.length)
      context =
        "\n\nUse the following document excerpts when relevant and cite them as (파일명 p.N). If they don't contain the answer, say so.\n\n" +
        hits.map((h, i) => `[${i + 1}] ${h.name} p.${h.page}\n${h.content}`).join("\n\n");
  } catch {}

  const history = [
    new SystemMessage("You are a helpful, concise assistant." + context),
    ...rows.map((m) => (m.role === "user" ? new HumanMessage(m.content) : new AIMessage(m.content))),
  ];

  c.header("X-Sources", encodeURIComponent(JSON.stringify(sources)));
  return streamText(c, async (stream) => {
    let reply = "";
    for await (const chunk of await model.stream(history)) {
      const t = typeof chunk.content === "string" ? chunk.content : "";
      if (t) {
        reply += t;
        await stream.write(t);
      }
    }
    if (reply) await db.insert(messages).values({ role: "assistant", content: reply });
  });
});

export default app;
