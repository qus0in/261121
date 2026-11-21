import { splitProps, type JSX } from "solid-js";
import { cn } from "@/lib/utils";

export function Button(props: JSX.ButtonHTMLAttributes<HTMLButtonElement>) {
  const [l, rest] = splitProps(props, ["class"]);
  return (
    <button
      class={cn("inline-flex h-9 shrink-0 items-center whitespace-nowrap justify-center rounded-md bg-neutral-900 px-4 text-sm font-medium text-white shadow transition hover:bg-neutral-800 disabled:opacity-50", l.class)}
      {...rest}
    />
  );
}
