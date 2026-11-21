import { createSignal, For, onMount, Show } from "solid-js";
import { Button } from "@/components/ui/button";

type Doc = { id: number; name: string; pageCount: number; chunkCount: number; createdAt: string };

export function Upload() {
  const [docs, setDocs] = createSignal<Doc[]>([]);
  const [file, setFile] = createSignal<File | null>(null);
  const [busy, setBusy] = createSignal(false);
  const [msg, setMsg] = createSignal("");
  const [err, setErr] = createSignal(false);

  const load = async () => setDocs(await (await fetch("/api/documents")).json());
  onMount(() => load().catch(() => {}));

  async function upload(e: Event) {
    e.preventDefault();
    const f = file();
    if (!f || busy()) return;
    setBusy(true);
    setErr(false);
    setMsg("추출·청킹·임베딩 중… (큰 파일은 시간이 걸립니다)");
    const fd = new FormData();
    fd.append("file", f);
    try {
      const res = await fetch("/api/documents", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setMsg(`완료: ${json.pageCount}페이지 → ${json.chunkCount}청크`);
      setFile(null);
      (e.target as HTMLFormElement).reset();
      await load();
    } catch (x) {
      setErr(true);
      setMsg(x instanceof Error ? x.message : "업로드 실패");
    }
    setBusy(false);
  }

  async function remove(id: number) {
    await fetch(`/api/documents/${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div class="mx-auto max-w-2xl p-4">
      <nav class="mb-4 flex gap-4 text-sm"><a class="underline" href="/">채팅</a><b>PDF 업로드</b></nav>
      <form class="flex items-center gap-2" onSubmit={upload}>
        <input type="file" accept="application/pdf" class="w-full text-sm" onChange={(e) => setFile(e.currentTarget.files?.[0] ?? null)} />
        <Button type="submit" disabled={busy() || !file()}>{busy() ? "처리 중…" : "업로드"}</Button>
      </form>
      <Show when={msg()}><p class={`mt-2 text-sm ${err() ? "text-red-600" : "text-neutral-600"}`}>{msg()}</p></Show>
      <ul class="mt-6 divide-y rounded-md border border-neutral-200 text-sm">
        <For each={docs()} fallback={<li class="p-3 text-neutral-500">업로드된 문서가 없습니다.</li>}>
          {(d) => (
            <li class="flex items-center justify-between gap-2 p-3">
              <div class="min-w-0">
                <div class="truncate font-medium">{d.name}</div>
                <div class="text-xs text-neutral-500">{d.pageCount}p · {d.chunkCount} chunks</div>
              </div>
              <Button class="bg-red-600 hover:bg-red-500" onClick={() => remove(d.id)}>삭제</Button>
            </li>
          )}
        </For>
      </ul>
    </div>
  );
}
