import { NextResponse } from "next/server";

/**
 * Which build is actually serving.
 *
 * "Is my change live?" has been unanswerable twice now without access to the
 * Vercel dashboard, and guessing wasted more time than this endpoint costs.
 * It sits behind the passcode like every other page — it is deliberately not
 * in proxy.ts's exclusion list — and reports nothing beyond what a deploy
 * already publishes about itself.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
    branch: process.env.VERCEL_GIT_COMMIT_REF ?? "local",
    message: process.env.VERCEL_GIT_COMMIT_MESSAGE?.split("\n")[0] ?? null,
    env: process.env.VERCEL_ENV ?? "development",
    builtAt: process.env.VERCEL_DEPLOYMENT_ID ? new Date().toISOString() : null,
  });
}
