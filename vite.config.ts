import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import tailwind from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [solid(), tailwind(), cloudflare()],
  resolve: { alias: { "@": "/src" } },
});
