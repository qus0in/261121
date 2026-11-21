import { index, integer, pgTable, serial, text, timestamp, vector } from "drizzle-orm/pg-core";

export const EMBED_DIM = 768;

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  role: text("role", { enum: ["user", "assistant"] }).notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const documents = pgTable("documents", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  pageCount: integer("page_count").notNull(),
  chunkCount: integer("chunk_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const chunks = pgTable(
  "chunks",
  {
    id: serial("id").primaryKey(),
    documentId: integer("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
    page: integer("page").notNull(),
    idx: integer("idx").notNull(),
    content: text("content").notNull(),
    embedding: vector("embedding", { dimensions: EMBED_DIM }).notNull(),
  },
  (t) => [index("chunks_embedding_idx").using("hnsw", t.embedding.op("vector_cosine_ops"))],
);
