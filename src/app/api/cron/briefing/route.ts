import { NextRequest } from "next/server";
import { runDailyBriefing } from "@/lib/agents/briefing";

export const dynamic = "force-dynamic";
// Gathering calendar and mail then writing the brief takes longer than the
// default allowance for a function that normally answers instantly.
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  // Vercel signs scheduled invocations with CRON_SECRET. Without the secret
  // configured this endpoint refuses outright rather than running for
  // anyone who finds the path — note the passcode gate cannot help here,
  // since a scheduled request carries no cookie and is excluded from it.
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    return Response.json(await runDailyBriefing());
  } catch (err) {
    console.error("Daily briefing failed:", err);
    return new Response("briefing failed", { status: 500 });
  }
}
