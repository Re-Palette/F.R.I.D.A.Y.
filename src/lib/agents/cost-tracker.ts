import { estimateCostUsd } from "@/lib/llm/pricing";
import type { TokenUsage } from "@/lib/llm/types";

export interface LLMCallRecord {
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

/**
 * Accumulates every LLM call made during one Agent Run — the orchestrator's
 * own turns AND the nested calls made inside tools (Planning's
 * decomposition, Creation's drafting/verification) — so agent_runs
 * reflects true cost (Master Brief §8), not just the outermost loop's
 * usage. One instance is created per run in loop.ts and threaded through
 * ToolExecutionContext.
 */
export class CostTracker {
  private calls: LLMCallRecord[] = [];

  record(model: string, usage: TokenUsage): void {
    this.calls.push({
      model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      costUsd: estimateCostUsd(model, usage),
    });
  }

  get entries(): readonly LLMCallRecord[] {
    return this.calls;
  }

  get totals(): { tokens: number; costUsd: number; callCount: number } {
    return this.calls.reduce(
      (acc, c) => ({
        tokens: acc.tokens + c.inputTokens + c.outputTokens,
        costUsd: acc.costUsd + c.costUsd,
        callCount: acc.callCount + 1,
      }),
      { tokens: 0, costUsd: 0, callCount: 0 }
    );
  }
}
