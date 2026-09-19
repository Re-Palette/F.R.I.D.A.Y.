import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import { memories } from "@/lib/db/schema";

/**
 * Forgetting something.
 *
 * A store that only grows is one you stop trusting: a fact that was right
 * in March and wrong since has to be removable, or everything alongside it
 * gets read with suspicion. Deleted outright rather than flagged, because
 * what this is for is not being said back to you again.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();
    const removed = await db
      .delete(memories)
      .where(and(eq(memories.id, id), eq(memories.userId, user.id)))
      .returning({ id: memories.id });

    if (!removed.length) {
      return NextResponse.json({ error: "見つかりませんでした。" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Failed to forget memory:", err);
    return NextResponse.json({ error: "削除できませんでした。" }, { status: 500 });
  }
}
