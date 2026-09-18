import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema";

type Db = NeonHttpDatabase<typeof schema>;

let cached: Db | null = null;

function getDb(): Db {
  if (cached) return cached;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set. Add it to your environment (see .env.example).");
  }
  cached = drizzle(neon(url), { schema });
  return cached;
}

// Lazily initialized on first real query (at request time) instead of at
// module import time. Next.js imports this module (transitively, from
// almost every route) during `next build`'s page-data collection step,
// which runs on the build machine before real requests exist — throwing
// here eagerly would crash the whole build if DATABASE_URL isn't present
// in that environment (see the same pattern/rationale in
// src/lib/auth/index.ts). Every property access below is forwarded to the
// real client, built (and only required to exist) the first time it's
// actually used.
export const db: Db = new Proxy({} as Db, {
  get(_target, prop) {
    const real = getDb();
    const value = Reflect.get(real, prop);
    return typeof value === "function" ? value.bind(real) : value;
  },
});
