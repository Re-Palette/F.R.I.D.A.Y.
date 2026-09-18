import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import { conversations } from "@/lib/db/schema";

export async function POST() {
  try {
    const user = await getCurrentUser();
    const [conversation] = await db.insert(conversations).values({ userId: user.id }).returning();
    return NextResponse.json({ id: conversation.id });
  } catch (err) {
    // An uncaught throw here becomes a 500 with an empty body, which the
    // caller cannot tell apart from a successful-but-empty response — the
    // reason a failure on this route looked like the app doing nothing at
    // all. Return the reason instead.
    console.error("Failed to create conversation:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
