import { neon } from "@neondatabase/serverless";
await neon(process.env.NEON_CONNECTION_URL)`CREATE EXTENSION IF NOT EXISTS vector`;
console.log("pgvector enabled");
