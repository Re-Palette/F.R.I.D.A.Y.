import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { activityLogs, agentRuns, approvals, drafts, messages } from "@/lib/db/schema";
import { CostTracker } from "./cost-tracker";
import { getTool } from "./tools";

/**
 * Master Brief §12's permission levels, finally enforced. A tool call the
 * tool itself flags as consequential is not run by the Agent Loop; it is
 * parked here until a human resolves it, then executed with the exact input
 * that was approved.
 *
 * This is a confirmation step, not an authorization one: the deployment has
 * no login, so whoever can reach the URL can also approve. It stops the
 * agent acting on its own initiative — it does not decide who may act.
 */

interface ApprovalPayload {
  tool: string;
  input: Record<string, unknown>;
  conversationId: string;
}

export interface PendingApproval {
  id: string;
  level: number;
  tool: string;
  summary: string;
  input: Record<string, unknown>;
  createdAt: string;
}

export async function createApproval(params: {
  userId: string;
  conversationId: string;
  tool: string;
  input: Record<string, unknown>;
  level: 2 | 3;
  summary: string;
}): Promise<string> {
  const payload: ApprovalPayload = {
    tool: params.tool,
    input: params.input,
    conversationId: params.conversationId,
  };

  const [approval] = await db
    .insert(approvals)
    .values({ userId: params.userId, level: params.level, type: params.tool, payload })
    .returning();

  // The draft is what a human reads before deciding; the payload is what gets
  // executed. Keeping them separate is what lets the preview be readable
  // without the decision being made on a lossy summary.
  await db.insert(drafts).values({
    approvalId: approval.id,
    type: params.tool,
    content: { summary: params.summary, input: params.input },
  });

  await db.insert(activityLogs).values({
    userId: params.userId,
    actor: "agent",
    action: "approval_requested",
    target: params.tool,
    metadata: { approvalId: approval.id, summary: params.summary },
  });

  return approval.id;
}

export async function listPendingApprovals(userId: string): Promise<PendingApproval[]> {
  const rows = await db
    .select({ approval: approvals, draft: drafts })
    .from(approvals)
    .leftJoin(drafts, eq(drafts.approvalId, approvals.id))
    .where(and(eq(approvals.userId, userId), eq(approvals.status, "pending")))
    .orderBy(asc(approvals.createdAt));

  return rows.map(({ approval, draft }) => {
    const content = (draft?.content ?? {}) as { summary?: string };
    const payload = approval.payload as ApprovalPayload;
    return {
      id: approval.id,
      level: approval.level,
      tool: approval.type,
      summary: content.summary ?? approval.type,
      input: payload.input ?? {},
      createdAt: approval.createdAt.toISOString(),
    };
  });
}

export interface ResolveResult {
  status: "approved" | "rejected";
  detail: string;
}

export async function resolveApproval(
  approvalId: string,
  userId: string,
  action: "approve" | "reject"
): Promise<ResolveResult> {
  const [approval] = await db
    .select()
    .from(approvals)
    .where(and(eq(approvals.id, approvalId), eq(approvals.userId, userId)))
    .limit(1);

  if (!approval) throw new Error("承認待ちの操作が見つかりません。");
  if (approval.status !== "pending") throw new Error("この操作はすでに処理済みです。");

  const payload = approval.payload as ApprovalPayload;

  if (action === "reject") {
    await db
      .update(approvals)
      .set({ status: "rejected", resolvedAt: new Date() })
      .where(eq(approvals.id, approvalId));
    await db.insert(activityLogs).values({
      userId,
      actor: "user",
      action: "approval_rejected",
      target: approval.type,
      metadata: { approvalId },
    });
    return { status: "rejected", detail: `${approval.type} を却下しました。` };
  }

  const tool = getTool(payload.tool);
  if (!tool) throw new Error(`ツール ${payload.tool} が見つかりません。`);

  // Approved work still spends money, so it gets its own run row rather than
  // slipping past the per-run cost accounting the Agent Loop does.
  const costTracker = new CostTracker();
  const [run] = await db
    .insert(agentRuns)
    .values({ agentRole: "approval", status: "running", steps: [] })
    .returning();

  let result;
  try {
    result = await tool.execute(payload.input, {
      userId,
      conversationId: payload.conversationId,
      costTracker,
    });
  } catch (err) {
    result = { ok: false, content: `Tool error: ${err instanceof Error ? err.message : String(err)}` };
  }

  const totals = costTracker.totals;
  await db
    .update(agentRuns)
    .set({
      status: result.ok ? "succeeded" : "failed",
      steps: [{ tool: payload.tool, ok: result.ok, summary: result.content.slice(0, 300) }],
      llmCalls: costTracker.entries,
      apiCallCount: totals.callCount,
      tokensUsed: totals.tokens,
      costUsd: totals.costUsd.toFixed(4),
      endedAt: new Date(),
    })
    .where(eq(agentRuns.id, run.id));

  await db
    .update(approvals)
    .set({ status: "approved", resolvedAt: new Date() })
    .where(eq(approvals.id, approvalId));

  await db.insert(activityLogs).values({
    userId,
    actor: "user",
    action: "approval_approved",
    target: approval.type,
    metadata: { approvalId, ok: result.ok, result: result.content.slice(0, 500) },
  });

  // Put the outcome back in the conversation it came from, so the thread
  // shows what actually happened rather than ending at "承認待ちです".
  await db.insert(messages).values({
    conversationId: payload.conversationId,
    role: "assistant",
    content: result.ok
      ? `承認された操作を実行しました。\n${result.content}`
      : `承認された操作の実行に失敗しました。\n${result.content}`,
  });

  return { status: "approved", detail: result.content };
}
