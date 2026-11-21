import { splitProps, type JSX } from "solid-js";
import { cn } from "@/lib/utils";

export function Input(props: JSX.InputHTMLAttributes<HTMLInputElement>) {
  const [l, rest] = splitProps(props, ["class"]);
  return (
    <input
      class={cn("flex h-9 w-full rounded-md border border-neutral-300 bg-transparent px-3 text-sm shadow-sm outline-none focus:ring-2 focus:ring-neutral-400", l.class)}
      {...rest}
    />
  );
}
