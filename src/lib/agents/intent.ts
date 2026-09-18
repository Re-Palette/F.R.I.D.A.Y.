import {
  formatEventLine,
  isGoogleCalendarConfigured,
  listEvents,
  localDateRangeToUtc,
  localDateString,
} from "@/lib/integrations/google-calendar";

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

const SCHEDULE_WORDS = /予定|スケジュール|カレンダー|空いてる|空いて/;

/**
 * The Master Brief §3 flagship example, now real: "明日の予定ある？" never
 * reaches the model at all — a fixed pattern match goes straight to the
 * Calendar API and formats the (real, non-hallucinated) result. Deliberately
 * narrow (requires a schedule word *and* a time word together) to avoid
 * false positives like "明日までにレポート作って", which should still go
 * through the full Agent Loop. Anything outside today/tomorrow falls
 * through to the get_calendar_events tool instead — still real data, just
 * not on this zero-LLM-call fast path.
 */
function detectCalendarIntent(message: string): DeterministicIntentMatch | null {
  if (!isGoogleCalendarConfigured()) return null;
  if (!SCHEDULE_WORDS.test(message)) return null;

  let offsetDays: number;
  let label: string;
  if (/明日/.test(message)) {
    offsetDays = 1;
    label = "明日";
  } else if (/今日/.test(message)) {
    offsetDays = 0;
    label = "今日";
  } else {
    return null;
  }

  return {
    intent: `calendar.${label}`,
    async handle() {
      const date = localDateString(offsetDays);
      const { timeMin, timeMax } = localDateRangeToUtc(date);
      try {
        const events = await listEvents(timeMin, timeMax);
        if (!events.length) return `${label}の予定はありません。`;
        return `${label}の予定:\n${events.map(formatEventLine).join("\n")}`;
      } catch (err) {
        return `カレンダーの取得に失敗しました: ${(err as Error).message}`;
      }
    },
  };
}

/**
 * Master Brief §3: "コードで処理できるものは、可能な限りコード側で処理する."
 * Before spending a full Agent Loop turn (an LLM call just to decide which
 * tool to call), check whether the message matches an intent this app
 * already has a direct, deterministic answer for. A match skips the model
 * entirely except for a minimal formatting pass over real API data.
 */
const DETECTORS: DeterministicIntentDetector[] = [detectCalendarIntent];

export function detectDeterministicIntent(message: string): DeterministicIntentMatch | null {
  for (const detect of DETECTORS) {
    const match = detect(message);
    if (match) return match;
  }
  return null;
}
