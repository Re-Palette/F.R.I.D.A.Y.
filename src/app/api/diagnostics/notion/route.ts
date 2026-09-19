import type { NextRequest } from "next/server";
import { checkNotion } from "@/lib/integrations/notion";

/**
 * Is Notion connected?
 *
 * A route rather than something to ask out loud, because this is a setup
 * question: it has to work when the rest doesn't, and the answer is a list
 * of things that are and aren't true rather than a sentence. It sits behind
 * the same passcode gate as everything else, so opening it in a browser
 * that has already unlocked just works.
 *
 * ?write=1 goes as far as creating a page and trashing it, which is the
 * only step that proves the integration may write and not only read.
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const write = req.nextUrl.searchParams.get("write") === "1";
  try {
    const result = await checkNotion(write);
    return Response.json(result, { status: result.ok ? 200 : 503 });
  } catch (err) {
    console.error("Notion check failed:", err);
    return Response.json(
      { ok: false, steps: [], hint: `確認中にエラーが発生しました: ${(err as Error).message}` },
      { status: 500 }
    );
  }
}
