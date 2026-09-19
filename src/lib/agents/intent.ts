import { describeUsage, getUsageSummary } from "./usage";
import {
  describeEvents,
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
        // Spoken, not listed: this answer reaches the user exactly as it is
        // written, with no model in between to turn it into sentences.
        return describeEvents(label, await listEvents(timeMin, timeMax));
      } catch (err) {
        return `カレンダーの取得に失敗しました: ${(err as Error).message}`;
      }
    },
  };
}

/**
 * "APIの使用状況は？" — answered from this app's own records, with no model
 * call at all.
 *
 * Fitting as well as cheap: asking what something costs should not itself
 * cost anything, and a question about spending answered by spending is a
 * small absurdity.
 *
 * Two shapes, because "API" alone is too broad. Naming Claude is enough
 * with any usage word; naming only the API or tokens needs an explicitly
 * financial one, so "GmailのAPIの利用制限は？" still goes through the full
 * loop where it belongs.
 */
const CLAUDE = /claude|クロード/i;
const USAGE_ASK = /使用|利用|消費|コスト|料金|費用|課金|いくら|請求|使って(?:る|いる|いま)/;
const API_SUBJECT = /API|ＡＰＩ|エーピーアイ|トークン/i;
const SPEND_ASK = /コスト|料金|費用|課金|いくら|請求|使用量|使用状況|利用状況|消費/;

export function detectsUsageQuestion(message: string): boolean {
  if (CLAUDE.test(message) && USAGE_ASK.test(message)) return true;
  return API_SUBJECT.test(message) && SPEND_ASK.test(message);
}

function detectUsageIntent(message: string): DeterministicIntentMatch | null {
  if (!detectsUsageQuestion(message)) return null;

  return {
    intent: "usage.api",
    async handle() {
      try {
        return describeUsage(await getUsageSummary());
      } catch (err) {
        return `利用状況を取得できませんでした: ${(err as Error).message}`;
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
const DETECTORS: DeterministicIntentDetector[] = [detectCalendarIntent, detectUsageIntent];

export function detectDeterministicIntent(message: string): DeterministicIntentMatch | null {
  for (const detect of DETECTORS) {
    const match = detect(message);
    if (match) return match;
  }
  return null;
}
