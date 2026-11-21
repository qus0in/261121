import "./styles.css";
import { render } from "solid-js/web";
import { createSignal, For, onMount } from "solid-js";
import { createStore } from "solid-js/store";
import { Button } from "@/components/ui/button";
import { Upload } from "./upload";
import { Input } from "@/components/ui/input";

type Msg = { role: "user" | "assistant"; content: string };

function App() {
  const [msgs, setMsgs] = createStore<Msg[]>([]);
  const [text, setText] = createSignal("");
  const [busy, setBusy] = createSignal(false);

  onMount(async () => {
    try {
      setMsgs(await (await fetch("/api/messages")).json());
    } catch {}
  });

  async function send(e: Event) {
    e.preventDefault();
    const content = text().trim();
    if (!content || busy()) return;
    setText("");
    setBusy(true);
    setMsgs(msgs.length, { role: "user", content });
    const i = msgs.length;
    setMsgs(i, { role: "assistant", content: "" });
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        setMsgs(i, "content", (c) => c + value);
      }
    } catch {
      setMsgs(i, "content", "오류가 발생했습니다.");
    }
    setBusy(false);
  }

  return (
    <div class="mx-auto flex h-screen max-w-2xl flex-col p-4">
      <nav class="mb-3 flex gap-4 text-sm"><b>채팅</b><a class="underline" href="/upload">PDF 업로드</a></nav>
      <div class="flex-1 space-y-3 overflow-y-auto">
        <For each={msgs}>
          {(m) => (
            <div class={m.role === "user" ? "flex justify-end" : "flex"}>
              <div class={`max-w-[80%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${m.role === "user" ? "bg-neutral-900 text-white" : "bg-neutral-100"}`}>
                {m.content || "…"}
              </div>
            </div>
          )}
        </For>
      </div>
      <form class="mt-3 flex gap-2" onSubmit={send}>
        <Input value={text()} onInput={(e) => setText(e.currentTarget.value)} placeholder="메시지를 입력하세요" />
        <Button type="submit" disabled={busy()}>전송</Button>
      </form>
    </div>
  );
}

render(() => (location.pathname.startsWith("/upload") ? <Upload /> : <App />), document.getElementById("root")!);
