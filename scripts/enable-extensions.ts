import { neon } from "@neondatabase/serverless";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
  const sql = neon(url);
  await sql`CREATE EXTENSION IF NOT EXISTS vector`;
  console.log("pgvector extension enabled.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
