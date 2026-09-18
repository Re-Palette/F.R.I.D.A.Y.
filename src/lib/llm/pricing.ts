import type { TokenUsage } from "./types";

/**
 * USD per million tokens, first-party Anthropic API rates. Used only for
 * the Agent Loop's cost guardrail (Master Brief §20) — approximate is fine,
 * this never touches billing. Update if pricing changes.
 */
const PRICE_PER_MTOK: Record<string, { input: number; output: number }> = {
  "claude-opus-5": { input: 5.0, output: 25.0 },
  "claude-sonnet-5": { input: 2.0, output: 10.0 },
  "claude-haiku-4-5": { input: 1.0, output: 5.0 },
};

const FALLBACK_PRICE = { input: 3.0, output: 15.0 };

export function estimateCostUsd(model: string, usage: TokenUsage): number {
  const price = PRICE_PER_MTOK[model] ?? FALLBACK_PRICE;
  return (usage.inputTokens * price.input + usage.outputTokens * price.output) / 1_000_000;
}
