import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import { scheduledTasks } from "@/lib/db/schema";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();
    const cancelled = await db
      .update(scheduledTasks)
      .set({ status: "cancelled" })
      .where(and(eq(scheduledTasks.id, id), eq(scheduledTasks.userId, user.id)))
      .returning({ id: scheduledTasks.id });

    if (!cancelled.length) {
      return NextResponse.json({ error: "見つかりませんでした。" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Failed to cancel scheduled task:", err);
    return NextResponse.json({ error: "取り消せませんでした。" }, { status: 500 });
  }
}
