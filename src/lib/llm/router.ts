import { AnthropicProvider } from "./anthropic";
import type { LLMProvider } from "./types";

export type ModelTier = "low" | "standard" | "high";

/**
 * Task kinds the router understands. Agents ask for a kind, not a model —
 * keeps cost control (Master Brief §20) centralized in one place.
 */
export type TaskKind =
  | "chat" // ordinary conversation turn
  | "classification" // intent/routing decisions
  | "summarization"
  | "planning" // task decomposition, derived tasks
  | "research_synthesis"
  | "verification";

const TASK_TIER: Record<TaskKind, ModelTier> = {
  chat: "standard",
  classification: "low",
  summarization: "low",
  planning: "high",
  research_synthesis: "standard",
  verification: "standard",
};

const TIER_MODEL: Record<ModelTier, string> = {
  low: process.env.MODEL_LOW ?? "claude-haiku-4-5",
  standard: process.env.MODEL_STANDARD ?? "claude-sonnet-5",
  high: process.env.MODEL_HIGH ?? "claude-opus-5",
};

let anthropicProvider: LLMProvider | null = null;

function getAnthropicProvider(): LLMProvider {
  if (!anthropicProvider) anthropicProvider = new AnthropicProvider();
  return anthropicProvider;
}

export interface RoutedModel {
  provider: LLMProvider;
  model: string;
  tier: ModelTier;
}

/**
 * Resolve which provider + model to use for a given task kind. Today this
 * always resolves to Anthropic; the indirection is what lets §16's
 * "switch providers/local model per task" goal happen later without
 * touching any Agent code.
 */
export function routeModel(kind: TaskKind, overrideTier?: ModelTier): RoutedModel {
  const tier = overrideTier ?? TASK_TIER[kind];
  return {
    provider: getAnthropicProvider(),
    model: TIER_MODEL[tier],
    tier,
  };
}
