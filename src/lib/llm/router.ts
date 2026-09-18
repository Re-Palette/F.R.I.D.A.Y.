import { OpenAIProvider } from "./openai";
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

/**
 * Model IDs are never hardcoded into Agent code — only here, and only as
 * env-overridable defaults. The defaults below are OpenAI's current
 * generation as reported by the installed `openai` SDK's own type
 * definitions (its ChatModel union) at implementation time — this sandbox's
 * network policy blocks platform.openai.com, so they could not be
 * cross-checked against the live pricing/models pages. Verify against
 * https://platform.openai.com/docs/models before relying on this in
 * production and override via env vars if anything has moved on.
 */
const TIER_MODEL: Record<ModelTier, string> = {
  low: process.env.OPENAI_FAST_MODEL ?? "gpt-5.6-luna",
  standard: process.env.OPENAI_CHAT_MODEL ?? "gpt-5.6-terra",
  high: process.env.OPENAI_REASONING_MODEL ?? "gpt-5.6-sol",
};

/**
 * Dev/cost override (Master Brief "Development Mode"): set
 * FORCE_MODEL_TIER=low to route every call through the cheapest model
 * regardless of task, with no code change — for cheap end-to-end testing.
 */
const FORCE_TIER = process.env.FORCE_MODEL_TIER as ModelTier | undefined;

let openaiProvider: LLMProvider | null = null;

function getOpenAIProvider(): LLMProvider {
  if (!openaiProvider) openaiProvider = new OpenAIProvider();
  return openaiProvider;
}

export interface RoutedModel {
  provider: LLMProvider;
  model: string;
  tier: ModelTier;
}

/**
 * Resolve which provider + model to use for a given task kind. Today this
 * always resolves to OpenAI; the indirection is what lets a future
 * provider switch or a local model happen without touching any Agent code.
 */
export function routeModel(kind: TaskKind, overrideTier?: ModelTier): RoutedModel {
  const tier = overrideTier ?? FORCE_TIER ?? TASK_TIER[kind];
  return {
    provider: getOpenAIProvider(),
    model: TIER_MODEL[tier],
    tier,
  };
}
