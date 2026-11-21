import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/worker/db/schema.ts",
  dbCredentials: { url: process.env.NEON_CONNECTION_URL! },
});
