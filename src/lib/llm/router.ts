import { AnthropicProvider } from "./anthropic";
import type { LLMProvider } from "./types";

/**
 * "Cheap by Default, Powerful When Necessary" (Master Brief update). Most
 * work — chat, classification, summaries, ordinary planning/creation —
 * runs on `fast`. `powerful` is reserved for what the caller has already
 * judged to need it, decided at zero extra LLM-call cost (see
 * agents/tools/create-plan.ts's `complexity` and create-document.ts's
 * `importance` params — the orchestrator sets these as part of the tool
 * call it's already making, not via a separate classification call).
 */
export type ModelTier = "fast" | "default" | "powerful";

/**
 * Task kinds the router understands. Agents ask for a kind, not a model —
 * keeps cost control centralized in one place.
 */
export type TaskKind =
  | "chat" // ordinary conversation turn + tool-choice orchestration
  | "classification" // intent/routing decisions
  | "summarization"
  | "planning" // task decomposition, derived tasks
  | "creation" // drafting a document/email/post
  | "research_synthesis"
  | "verification";

const TASK_TIER: Record<TaskKind, ModelTier> = {
  chat: "fast",
  classification: "fast",
  summarization: "fast",
  planning: "default",
  creation: "default",
  research_synthesis: "fast",
  verification: "default",
};

/**
 * Model IDs are never hardcoded into Agent code — only here, and only as
 * env-overridable defaults. `fast`/`default` both default to Haiku (the
 * cheapest currently-available Claude tier) per the "cheap by default"
 * principle; only `powerful` defaults to a higher-intelligence model.
 */
const TIER_MODEL: Record<ModelTier, string> = {
  fast: process.env.ANTHROPIC_FAST_MODEL ?? "claude-haiku-4-5",
  default: process.env.ANTHROPIC_DEFAULT_MODEL ?? "claude-haiku-4-5",
  powerful: process.env.ANTHROPIC_POWERFUL_MODEL ?? "claude-opus-5",
};

/**
 * Dev/cost override: set FORCE_MODEL_TIER=fast to route every call through
 * the cheapest model regardless of task, with no code change — for cheap
 * end-to-end testing during development.
 */
const FORCE_TIER = process.env.FORCE_MODEL_TIER as ModelTier | undefined;

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
 * always resolves to Anthropic; the indirection is what lets a future
 * provider switch or a local model happen without touching any Agent code.
 */
export function routeModel(kind: TaskKind, overrideTier?: ModelTier): RoutedModel {
  const tier = overrideTier ?? FORCE_TIER ?? TASK_TIER[kind];
  return {
    provider: getAnthropicProvider(),
    model: TIER_MODEL[tier],
    tier,
  };
}
