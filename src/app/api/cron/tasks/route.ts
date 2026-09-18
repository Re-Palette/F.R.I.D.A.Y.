import { NextRequest } from "next/server";
import { runDueTasks } from "@/lib/agents/scheduled-runner";

export const dynamic = "force-dynamic";
// Each due task is a full agent turn, so this needs far longer than a
// request that just answers from the database.
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    return Response.json(await runDueTasks());
  } catch (err) {
    console.error("Scheduled task dispatch failed:", err);
    return new Response("dispatch failed", { status: 500 });
  }
}
