import { Hono } from "hono";
import { streamText } from "hono/streaming";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";

type Env = { Bindings: { GEMINI_API_KEY: string } };
type Msg = { role: "user" | "assistant"; content: string };

const app = new Hono<Env>();

app.post("/api/chat", async (c) => {
  const { messages } = await c.req.json<{ messages: Msg[] }>();
  const model = new ChatGoogleGenerativeAI({
    apiKey: c.env.GEMINI_API_KEY,
    model: "gemini-3.5-flash-lite",
    streaming: true,
  });
  const history = [
    new SystemMessage("You are a helpful, concise assistant."),
    ...messages.map((m) => (m.role === "user" ? new HumanMessage(m.content) : new AIMessage(m.content))),
  ];
  return streamText(c, async (stream) => {
    for await (const chunk of await model.stream(history)) {
      const t = typeof chunk.content === "string" ? chunk.content : "";
      if (t) await stream.write(t);
    }
  });
});

export default app;
