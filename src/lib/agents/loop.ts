import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { agentRuns, sources } from "@/lib/db/schema";
import { routeModel } from "@/lib/llm/router";
import type { ContentBlock, LLMMessage } from "@/lib/llm/types";
import { getTool, toLLMToolDefs } from "./tools";
import type { ToolDefinition, ToolResult } from "./tools";
import { extractSourcesFromContent } from "./research";
import { CostTracker } from "./cost-tracker";
import { createApproval } from "./approvals";

export interface AgentLoopLimits {
  maxSteps: number;
  timeoutMs: number;
  maxTokens: number;
  maxCostUsd: number;
}

const DEFAULT_LIMITS: AgentLoopLimits = {
  maxSteps: 6,
  timeoutMs: 60_000,
  maxTokens: 40_000,
  maxCostUsd: 1.0,
};

export interface AgentLoopParams {
  userId: string;
  conversationId: string;
  system: string;
  /** Full conversation history; the last entry is the newest user turn. */
  messages: LLMMessage[];
  limits?: Partial<AgentLoopLimits>;
  /**
   * Text the model writes, handed over as it is written. The loop's own
   * result is unchanged — this only lets the answer start reaching the user
   * before the turn is over.
   */
  onText?: (text: string) => void;
}

export interface RecordedStep {
  tool: string;
  ok: boolean;
  summary: string;
}

export interface AgentLoopResult {
  finalText: string;
  steps: RecordedStep[];
}

class AgentLoopLimitError extends Error {
  constructor(public reason: "timeout" | "budget_exceeded") {
    super(reason);
  }
}

function textOf(content: ContentBlock[]): string {
  return content
    .filter((b): b is Extract<ContentBlock, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("");
}

async function persistDiscoveredSources(content: ContentBlock[]) {
  const found = extractSourcesFromContent(content);
  if (!found.length) return;
  await db.insert(sources).values(found.map((s) => ({ url: s.url, title: s.title })));
}

/**
 * The Main Agent's Agent Loop (Master Brief §6): Observe → Plan → Act →
 * Observe Result → Evaluate → Continue/Retry → Complete. "Plan/Act" here is
 * the model's own tool-use decision (an orchestrator-worker pattern) —
 * delegation to Planning/Research/Creation happens via the tools it's
 * given, not a separate hardcoded router. Guardrails bound the whole run.
 *
 * The orchestrator itself always runs on the "chat" tier (fast/cheap by
 * default — see Model Router). Tools that need more intelligence for their
 * *own* internal work (Planning's decomposition, Creation's drafting/
 * verification) make their own routeModel() calls at a task-appropriate
 * tier, recorded into the same `costTracker` so agent_runs reflects the
 * run's true total cost, not just the orchestrator's share of it.
 */
/**
 * Level 1 tools run. Anything the tool flags as consequential for this input
 * is parked for a human instead, and the model is told so — it must not
 * report the action as done, and it must not retry to get around the gate.
 */
async function runOrQueue(
  tool: ToolDefinition,
  input: Record<string, unknown>,
  params: AgentLoopParams,
  costTracker: CostTracker
): Promise<ToolResult> {
  const request = tool.approval?.(input) ?? null;

  if (request) {
    const id = await createApproval({
      userId: params.userId,
      conversationId: params.conversationId,
      tool: tool.name,
      input,
      level: request.level,
      summary: request.summary,
    });
    return {
      ok: true,
      content:
        `NOT EXECUTED — queued for the user's approval (approval id ${id}): ${request.summary}. ` +
        `Tell the user it is waiting for their approval and that they can approve it from the 承認待ち screen. ` +
        `Do not claim it has been done, and do not call this tool again for the same request.`,
    };
  }

  return tool
    .execute(input, {
      userId: params.userId,
      conversationId: params.conversationId,
      costTracker,
    })
    .catch((err: Error) => ({ ok: false, content: `Tool error: ${err.message}` }));
}

export async function runAgentLoop(params: AgentLoopParams): Promise<AgentLoopResult> {
  const limits = { ...DEFAULT_LIMITS, ...params.limits };
  const { provider, model } = routeModel("chat");
  const deadline = Date.now() + limits.timeoutMs;
  const costTracker = new CostTracker();

  // Started, not waited for: the user is otherwise sitting through a round
  // trip to Neon before the model is even asked, and nothing until finish()
  // needs the row's id.
  const runRow = db
    .insert(agentRuns)
    .values({ agentRole: "main", status: "running", steps: [] })
    .returning();

  const messages: LLMMessage[] = [...params.messages];
  const steps: RecordedStep[] = [];
  let finalText = "";

  const finish = async (status: "succeeded" | "failed" | "timed_out") => {
    const [run] = await runRow;
    const totals = costTracker.totals;
    await db
      .update(agentRuns)
      .set({
        status,
        steps,
        llmCalls: costTracker.entries,
        apiCallCount: totals.callCount,
        tokensUsed: totals.tokens,
        costUsd: totals.costUsd.toFixed(4),
        endedAt: new Date(),
      })
      .where(eq(agentRuns.id, run.id));
  };

  try {
    for (let step = 0; step < limits.maxSteps; step++) {
      if (Date.now() > deadline) throw new AgentLoopLimitError("timeout");

      const result = await provider.complete({
        model,
        system: params.system,
        messages,
        tools: toLLMToolDefs(),
        enableWebSearch: true,
        maxTokens: 4096,
        onText: params.onText,
      });

      costTracker.record(model, result.usage);
      const totals = costTracker.totals;
      if (totals.tokens > limits.maxTokens || totals.costUsd > limits.maxCostUsd) {
        throw new AgentLoopLimitError("budget_exceeded");
      }

      await persistDiscoveredSources(result.content);
      messages.push({ role: "assistant", content: result.content });

      if (result.stopReason === "refusal") {
        finalText = "その内容には対応できません。別の頼み方を試してもらえますか？";
        break;
      }

      if (result.stopReason === "pause_turn") {
        // Server-side tool (web_search/web_fetch) hit its internal iteration
        // limit mid-turn — resume by simply continuing the loop.
        continue;
      }

      const toolUses = result.content.filter(
        (b): b is Extract<ContentBlock, { type: "tool_use" }> => b.type === "tool_use"
      );

      if (result.stopReason === "max_tokens") {
        // A tool call cut off at the token limit usually parses as valid
        // JSON but with truncated content — never run it on partial input.
        finalText =
          toolUses.length > 0
            ? "（ツール呼び出しの生成が長さ制限で途中まで切れたため、実行せずに止めました。もう少し簡潔な依頼に分けてもらえますか？）"
            : `（応答が長くなりすぎたため途中で打ち切りました）\n${textOf(result.content)}`;
        break;
      }

      if (toolUses.length === 0) {
        finalText = textOf(result.content);
        break;
      }

      const toolResults = await Promise.all(
        toolUses.map(async (call): Promise<ContentBlock> => {
          const tool = getTool(call.name);
          const outcome = tool
            ? await runOrQueue(tool, call.input, params, costTracker)
            : { ok: false, content: `Unknown tool: ${call.name}` };

          steps.push({ tool: call.name, ok: outcome.ok, summary: outcome.content.slice(0, 300) });
          return { type: "tool_result", toolUseId: call.id, content: outcome.content, isError: !outcome.ok };
        })
      );

      messages.push({ role: "user", content: toolResults });
    }

    if (!finalText) {
      finalText = "（複雑な依頼のため処理を打ち切りました。もう少し具体的に、または段階的に頼んでもらえますか？）";
    }

    await finish("succeeded");
    return { finalText, steps };
  } catch (err) {
    // The reason used to be discarded entirely — not logged, not returned —
    // leaving a generic apology as the only evidence that anything broke.
    console.error("Agent loop failed:", err);
    await finish(err instanceof AgentLoopLimitError && err.reason === "timeout" ? "timed_out" : "failed");
    return {
      finalText: "（エラーにより処理を中断しました。もう一度お試しください）",
      steps,
    };
  }
}
