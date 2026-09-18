import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import { conversations } from "@/lib/db/schema";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [conversation] = await db.insert(conversations).values({ userId: user.id }).returning();
  return NextResponse.json({ id: conversation.id });
}
