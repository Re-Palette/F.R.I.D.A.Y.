import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";

async function main() {
  // A standalone script gets none of Next.js's .env.local loading, so read it
  // here for local runs. On Vercel there is no such file and the real
  // variables are already in process.env.
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // No .env.local — expected outside local dev.
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    // A build with no database configured has nothing to migrate. That is a
    // deployment-configuration gap, not a compile error, so it must not take
    // the whole build down — `next build` never touches the database anyway
    // (see the lazy init in src/lib/db/client.ts), and the app still fails
    // loudly at the first real query. Preview builds in particular often have
    // a narrower env var list than Production.
    console.warn("DATABASE_URL is not set — skipping pgvector + migrations.");
    return;
  }

  // Same HTTP transport the app itself uses, rather than drizzle-kit's TCP
  // connection: one less thing that can behave differently in a build
  // container than it does at runtime.
  const sql = neon(url);
  await sql`CREATE EXTENSION IF NOT EXISTS vector`;
  await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });
  console.log("pgvector enabled and migrations applied.");
}

main().catch((err) => {
  // A database that is configured but unreachable, or a migration that does
  // not apply, is a real failure: fail the build rather than shipping code
  // against a schema that never got updated.
  console.error(err);
  process.exit(1);
});
