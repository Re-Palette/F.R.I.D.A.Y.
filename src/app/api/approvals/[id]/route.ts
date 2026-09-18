import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { resolveApproval } from "@/lib/agents/approvals";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { action } = (await req.json()) as { action: "approve" | "reject" };
    if (action !== "approve" && action !== "reject") {
      return NextResponse.json({ error: "不正な操作です。" }, { status: 400 });
    }

    const user = await getCurrentUser();
    return NextResponse.json(await resolveApproval(id, user.id, action));
  } catch (err) {
    console.error("Failed to resolve approval:", err);
    // Unlike the other routes, the message here is written for the user —
    // "already handled", "not found" — so it is worth passing through.
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "処理できませんでした。" },
      { status: 500 }
    );
  }
}
