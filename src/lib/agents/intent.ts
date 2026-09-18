export interface DeterministicIntentContext {
  userId: string;
  conversationId: string;
}

export interface DeterministicIntentMatch {
  /** Label for logging, e.g. "calendar.today" — not shown to the user. */
  intent: string;
  /** Produces the final answer directly — no LLM tool-choice call needed at all. */
  handle: (ctx: DeterministicIntentContext) => Promise<string>;
}

export type DeterministicIntentDetector = (message: string) => DeterministicIntentMatch | null;

/**
 * Master Brief §3: "コードで処理できるものは、可能な限りコード側で処理する."
 * Before spending a full Agent Loop turn (an LLM call just to decide which
 * tool to call), check whether the message matches an intent this app
 * already has a direct, deterministic answer for — e.g. "明日の予定ある？"
 * once Google Calendar is connected (Phase 4). A match skips the model
 * entirely except for a minimal formatting pass over real API data.
 *
 * No detectors are registered yet: Phase 3 only ships the agent tools
 * (create_plan/create_document), no external service connections to be
 * deterministic about. This module exists so that shape is decided now —
 * Phase 4's Calendar/Gmail/Notion integrations register into `DETECTORS`
 * rather than every integration re-inventing where this check happens.
 */
const DETECTORS: DeterministicIntentDetector[] = [];

export function detectDeterministicIntent(message: string): DeterministicIntentMatch | null {
  for (const detect of DETECTORS) {
    const match = detect(message);
    if (match) return match;
  }
  return null;
}
