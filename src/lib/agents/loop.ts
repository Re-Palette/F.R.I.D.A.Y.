import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { agentRuns, sources } from "@/lib/db/schema";
import { routeModel } from "@/lib/llm/router";
import { estimateCostUsd } from "@/lib/llm/pricing";
import type { ContentBlock, LLMMessage } from "@/lib/llm/types";
import { getTool, toLLMToolDefs } from "./tools";
import { extractSourcesFromContent } from "./research";

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
 */
export async function runAgentLoop(params: AgentLoopParams): Promise<AgentLoopResult> {
  const limits = { ...DEFAULT_LIMITS, ...params.limits };
  const { provider, model } = routeModel("chat");
  const deadline = Date.now() + limits.timeoutMs;

  const [run] = await db.insert(agentRuns).values({ agentRole: "main", status: "running", steps: [] }).returning();

  const messages: LLMMessage[] = [...params.messages];
  const steps: RecordedStep[] = [];
  let tokensUsed = 0;
  let costUsd = 0;
  let finalText = "";

  const finish = async (status: "succeeded" | "failed" | "timed_out") => {
    await db
      .update(agentRuns)
      .set({ status, steps, tokensUsed, costUsd: costUsd.toFixed(4), endedAt: new Date() })
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
      });

      tokensUsed += result.usage.inputTokens + result.usage.outputTokens;
      costUsd += estimateCostUsd(model, result.usage);
      if (tokensUsed > limits.maxTokens || costUsd > limits.maxCostUsd) {
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
            ? await tool
                .execute(call.input, { userId: params.userId, conversationId: params.conversationId })
                .catch((err: Error) => ({ ok: false, content: `Tool error: ${err.message}` }))
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
    await finish(err instanceof AgentLoopLimitError && err.reason === "timeout" ? "timed_out" : "failed");
    return {
      finalText: "（エラーにより処理を中断しました。もう一度お試しください）",
      steps,
    };
  }
}
