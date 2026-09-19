import { NextRequest } from "next/server";
import { runDailyBriefing } from "@/lib/agents/briefing";
import { runDailyDigest } from "@/lib/agents/digest";
import { runDueTasks } from "@/lib/agents/scheduled-runner";

/**
 * Everything scheduled, behind one cron entry.
 *
 * Plans cap how many cron jobs a project may have and how often they may
 * run, so the configuration that works everywhere is a single daily entry.
 * That costs nothing here because the dispatcher runs whatever is *overdue*
 * rather than what is due at that instant — a coarser cadence delays work
 * instead of dropping it. On a plan that allows frequent crons, pointing a
 * second, more frequent entry at /api/cron/tasks makes scheduled tasks more
 * responsive without changing any of this.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Reported separately, and one failing does not stop the others: a broken
  // briefing should not also mean nothing scheduled ever runs, or that
  // yesterday's conversations are never written up.
  const [briefing, tasks, digest] = await Promise.allSettled([
    runDailyBriefing(),
    runDueTasks(),
    runDailyDigest(),
  ]);

  if (briefing.status === "rejected") console.error("Daily briefing failed:", briefing.reason);
  if (tasks.status === "rejected") console.error("Scheduled task dispatch failed:", tasks.reason);
  if (digest.status === "rejected") console.error("Daily digest failed:", digest.reason);

  return Response.json({
    briefing: briefing.status === "fulfilled" ? briefing.value : "failed",
    tasks: tasks.status === "fulfilled" ? tasks.value : "failed",
    digest: digest.status === "fulfilled" ? digest.value : "failed",
  });
}
