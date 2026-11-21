import { Hono } from "hono";
import { streamText } from "hono/streaming";
import { ChatAnthropic } from "@langchain/anthropic";
import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";

type Env = { Bindings: { ANTHROPIC_API_KEY: string } };
type Msg = { role: "user" | "assistant"; content: string };

const app = new Hono<Env>();

app.post("/api/chat", async (c) => {
  const { messages } = await c.req.json<{ messages: Msg[] }>();
  const model = new ChatAnthropic({
    apiKey: c.env.ANTHROPIC_API_KEY,
    model: "claude-sonnet-5-5",
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
