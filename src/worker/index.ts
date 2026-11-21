import { Hono } from "hono";
import { streamText } from "hono/streaming";
import { asc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { messages } from "./db/schema";

type Env = { Bindings: { GEMINI_API_KEY: string; NEON_CONNECTION_URL: string } };

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
  const history = [
    new SystemMessage("You are a helpful, concise assistant."),
    ...rows.map((m) => (m.role === "user" ? new HumanMessage(m.content) : new AIMessage(m.content))),
  ];

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
