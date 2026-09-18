import type { TokenUsage } from "./types";

/**
 * USD per million tokens. Used only for the Agent Loop's cost guardrail
 * (Master Brief §20) — approximate is fine, this never touches billing.
 * This sandbox's network policy blocks platform.openai.com, so these
 * figures could not be verified against OpenAI's live pricing page at
 * implementation time. Update from https://platform.openai.com/docs/pricing
 * once confirmed.
 */
const PRICE_PER_MTOK: Record<string, { input: number; output: number }> = {
  "gpt-5.6-sol": { input: 5.0, output: 30.0 },
  "gpt-5.6-terra": { input: 2.0, output: 12.0 },
  "gpt-5.6-luna": { input: 0.2, output: 1.2 },
};

const FALLBACK_PRICE = { input: 2.0, output: 12.0 };

export function estimateCostUsd(model: string, usage: TokenUsage): number {
  const price = PRICE_PER_MTOK[model] ?? FALLBACK_PRICE;
  return (usage.inputTokens * price.input + usage.outputTokens * price.output) / 1_000_000;
}
