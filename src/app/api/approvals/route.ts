import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { listPendingApprovals } from "@/lib/agents/approvals";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getCurrentUser();
    return NextResponse.json({ approvals: await listPendingApprovals(user.id) });
  } catch (err) {
    console.error("Failed to list approvals:", err);
    return NextResponse.json({ error: "承認待ちの一覧を取得できませんでした。" }, { status: 500 });
  }
}
