import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import { conversations } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getCurrentUser();
    const rows = await db
      .select({
        id: conversations.id,
        title: conversations.title,
        updatedAt: conversations.updatedAt,
      })
      .from(conversations)
      .where(eq(conversations.userId, user.id))
      .orderBy(desc(conversations.updatedAt))
      .limit(100);
    return NextResponse.json({ conversations: rows });
  } catch (err) {
    console.error("Failed to list conversations:", err);
    return NextResponse.json({ error: "会話一覧を取得できませんでした。" }, { status: 500 });
  }
}

export async function POST() {
  try {
    const user = await getCurrentUser();
    const [conversation] = await db.insert(conversations).values({ userId: user.id }).returning();
    return NextResponse.json({ id: conversation.id });
  } catch (err) {
    // An uncaught throw here becomes a 500 with an empty body, which the
    // caller cannot tell apart from a successful-but-empty response — the
    // reason a failure on this route looked like the app doing nothing at
    // all. The detail goes to the server log; this deployment has no login,
    // so the response says only that it failed.
    console.error("Failed to create conversation:", err);
    return NextResponse.json({ error: "会話を開始できませんでした。" }, { status: 500 });
  }
}
