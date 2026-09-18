import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { tasks, subtasks } from "@/lib/db/schema";
import { routeModel } from "@/lib/llm/router";
import type { ToolDefinition } from "./types";

const PLANNING_SYSTEM_PROMPT = `あなたはF.R.I.D.A.Y.のPlanning Agentです。
ユーザーの目的（goal）を達成するために本当に必要な作業を、ユーザーが明示していない
ものも含めて洗い出し、実行可能なサブタスクに分解してください。

出力は必ず以下のJSON形式のみ。説明文やコードフェンスは付けないこと:
{
  "priority": "low" | "normal" | "high" | "urgent",
  "subtasks": [
    { "description": string, "derived": boolean, "dependsOnIndexes": number[] }
  ]
}
- "derived" は、ユーザーが明示的に頼んでいないが目的達成に必要だとあなたが判断したタスクにtrueを付ける。
- "dependsOnIndexes" は同じ配列内の他のsubtaskの0始まりのindexを指す（依存がなければ空配列）。
- subtaskは3〜10個程度、具体的で実行可能な粒度にする。`;

interface PlanSubtaskOutput {
  description: string;
  derived: boolean;
  dependsOnIndexes: number[];
}

interface PlanOutput {
  priority: "low" | "normal" | "high" | "urgent";
  subtasks: PlanSubtaskOutput[];
}

function parsePlanJson(text: string): PlanOutput {
  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/, "")
    .replace(/```\s*$/, "");
  const parsed = JSON.parse(cleaned);
  if (!parsed || !Array.isArray(parsed.subtasks)) throw new Error("invalid plan JSON shape");
  return parsed as PlanOutput;
}

export const createPlanTool: ToolDefinition = {
  name: "create_plan",
  description:
    "Decompose a goal into an actionable plan: creates a task with concrete subtasks, including steps the user didn't explicitly ask for but that are genuinely needed to achieve the goal (derived tasks). Use this for any request that implies multi-step work — not for simple questions or small talk.",
  inputSchema: {
    type: "object",
    properties: {
      goal: { type: "string", description: "The user's goal, in their own words plus any relevant context." },
      deadline: { type: "string", description: "ISO 8601 date/time if the user gave one, otherwise omit." },
      complexity: {
        type: "string",
        enum: ["simple", "complex"],
        description:
          "Your own assessment of this plan's difficulty. 'simple': a handful of clear, well-understood steps. " +
          "'complex': large-scale decomposition, coordinating several kinds of work, or a decision that's " +
          "genuinely hard to get right. Defaults to 'simple' — only mark 'complex' when it truly warrants " +
          "deeper reasoning, since that costs more.",
      },
    },
    required: ["goal"],
  },
  level: 1,
  async execute(input, ctx) {
    const goal = String(input.goal ?? "").trim();
    if (!goal) return { ok: false, content: "goal is required" };

    // Zero extra LLM calls: the orchestrator (already calling this tool)
    // judges complexity as a tool argument, so tiering costs nothing beyond
    // the plan generation itself (Master Brief "Cheap by Default, Powerful
    // When Necessary").
    const tier = input.complexity === "complex" ? "powerful" : undefined;
    const { provider, model } = routeModel("planning", tier);
    let plan: PlanOutput;
    try {
      const result = await provider.complete({
        model,
        system: PLANNING_SYSTEM_PROMPT,
        messages: [{ role: "user", content: goal }],
        maxTokens: 2048,
      });
      ctx.costTracker.record(model, result.usage);
      const text = result.content
        .filter((b) => b.type === "text")
        .map((b) => (b.type === "text" ? b.text : ""))
        .join("");
      plan = parsePlanJson(text);
    } catch (err) {
      return { ok: false, content: `planning failed: ${(err as Error).message}` };
    }

    const deadline = typeof input.deadline === "string" ? new Date(input.deadline) : undefined;

    const [task] = await db
      .insert(tasks)
      .values({
        userId: ctx.userId,
        goal,
        priority: plan.priority ?? "normal",
        deadline: deadline && !Number.isNaN(deadline.getTime()) ? deadline : undefined,
        createdByAgent: "planning",
      })
      .returning();

    const insertedSubtasks = await db
      .insert(subtasks)
      .values(
        plan.subtasks.map((s) => ({
          taskId: task.id,
          description: s.description,
          derived: Boolean(s.derived),
          assignedAgent: "planning",
        }))
      )
      .returning();

    for (let i = 0; i < plan.subtasks.length; i++) {
      const deps = plan.subtasks[i].dependsOnIndexes ?? [];
      if (!deps.length) continue;
      const dependsOnIds = deps
        .filter((idx) => idx >= 0 && idx < insertedSubtasks.length && idx !== i)
        .map((idx) => insertedSubtasks[idx].id);
      if (dependsOnIds.length) {
        await db.update(subtasks).set({ dependsOn: dependsOnIds }).where(eq(subtasks.id, insertedSubtasks[i].id));
      }
    }

    const summary = insertedSubtasks
      .map((s, i) => `${i + 1}. ${s.description}${s.derived ? "（追加で必要と判断）" : ""}`)
      .join("\n");

    return {
      ok: true,
      content: `Plan created (task ${task.id}, priority ${task.priority}). Subtasks:\n${summary}`,
    };
  },
};
