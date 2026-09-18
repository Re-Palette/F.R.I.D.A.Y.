import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";

// TEMPORARY — added to work out why a deployment reported DATABASE_URL as
// unset while the Vercel dashboard showed it present. This deployment has no
// authentication, so delete this route once that question is answered.
// It reports only whether each variable has a value, never the value itself.

const CHECKED = [
  "DATABASE_URL",
  "ANTHROPIC_API_KEY",
  "ALLOWED_EMAIL",
  "NOTION_API_KEY",
  "NOTION_PARENT_PAGE_ID",
  "GOOGLE_CALENDAR_CLIENT_ID",
  "GOOGLE_CALENDAR_CLIENT_SECRET",
  "GOOGLE_CALENDAR_REFRESH_TOKEN",
];

export const dynamic = "force-dynamic";

export async function GET() {
  const present: Record<string, boolean> = {};
  for (const name of CHECKED) present[name] = Boolean(process.env[name]);

  let database: string;
  try {
    const rows = await db.execute<{ table_name: string }>(
      sql`select table_name from information_schema.tables where table_schema = 'public' order by table_name`
    );
    const names = (rows.rows ?? []).map((r) => r.table_name);
    database = names.length ? `ok — ${names.length} tables: ${names.join(", ")}` : "connected, but no tables";
  } catch (err) {
    database = `failed — ${err instanceof Error ? err.message : String(err)}`;
  }

  return NextResponse.json({
    present,
    database,
    deployment: {
      vercelEnv: process.env.VERCEL_ENV ?? null,
      branch: process.env.VERCEL_GIT_COMMIT_REF ?? null,
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
      region: process.env.VERCEL_REGION ?? null,
    },
  });
}
