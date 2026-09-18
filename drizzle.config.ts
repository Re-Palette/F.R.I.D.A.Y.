import { defineConfig } from "drizzle-kit";

// drizzle-kit doesn't load .env.local the way Next.js does, so even
// `db:generate` — which never opens a connection — tripped the check below
// without it.
try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local — expected in CI, where the real variables are already set.
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set. Add it to .env.local (see .env.example).");
}

export default defineConfig({
  schema: "./src/lib/db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
