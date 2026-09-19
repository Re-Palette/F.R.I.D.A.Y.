import { gte } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { agentRuns } from "@/lib/db/schema";
import { localDateRangeToUtc, localDateString } from "@/lib/integrations/google-calendar";

/**
 * What this app has spent on the Claude API.
 *
 * Every run already records it — the orchestrator's own turns and the
 * nested calls inside tools, per model, with token counts — and none of it
 * has ever been readable. This is the read side.
 *
 * It is this deployment's own consumption, which is the number that
 * actually answers "what is this thing costing me". It is not the
 * organisation's total: Claude Code, the Console and anything else on the
 * same key are invisible from here, and only Anthropic's Admin API can see
 * those.
 */

export interface UsageWindow {
  /** Individual calls to the model, including ones made inside tools. */
  calls: number;
  /** Agent runs — roughly, things asked of F.R.I.D.A.Y. */
  runs: number;
  tokens: number;
  costUsd: number;
}

export interface ModelUsage {
  model: string;
  calls: number;
  tokens: number;
  costUsd: number;
}

export interface UsageSummary {
  today: UsageWindow;
  month: UsageWindow;
  /** This month, dearest first. */
  byModel: ModelUsage[];
  /** The month being reported, as a number — 9 for September. */
  month0: number;
}

interface StoredCall {
  model?: unknown;
  inputTokens?: unknown;
  outputTokens?: unknown;
  costUsd?: unknown;
}

const empty = (): UsageWindow => ({ calls: 0, runs: 0, tokens: 0, costUsd: 0 });

function num(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Reads the per-call records off a run.
 *
 * jsonb comes back as whatever was written, so nothing here trusts its
 * shape: a row written by an older build, or half-written by a run that
 * died, must not take out the whole report.
 */
function callsOf(run: { llmCalls: unknown }): StoredCall[] {
  return Array.isArray(run.llmCalls) ? (run.llmCalls as StoredCall[]) : [];
}

/** A run as this needs to read it — the two columns it actually looks at. */
export interface UsageRun {
  startedAt: Date;
  llmCalls: unknown;
}

/**
 * The window being reported, in the user's own day rather than UTC's.
 *
 * With a +09:00 offset "today" begins at 15:00 the previous day in UTC, so
 * getting this wrong puts most of an evening's usage on the wrong date —
 * and it is the same boundary the calendar uses, so the two agree about
 * what today is.
 */
export function usageWindow(): { monthStart: Date; todayStart: Date; month0: number } {
  const today = localDateString(0);
  return {
    monthStart: new Date(localDateRangeToUtc(`${today.slice(0, 7)}-01`).timeMin),
    todayStart: new Date(localDateRangeToUtc(today).timeMin),
    month0: Number(today.slice(5, 7)),
  };
}

/**
 * Adds the runs up. Pure, so the bucketing and the day boundary can be
 * pinned down by tests rather than by a database.
 */
export function summarize(runs: UsageRun[], todayStart: Date, month0: number): UsageSummary {
  const today = empty();
  const month = empty();
  const perModel = new Map<string, ModelUsage>();
  const todayFrom = todayStart.getTime();

  for (const run of runs) {
    const isToday = run.startedAt.getTime() >= todayFrom;

    month.runs++;
    if (isToday) today.runs++;

    for (const call of callsOf(run)) {
      const model = typeof call.model === "string" && call.model ? call.model : "unknown";
      const tokens = num(call.inputTokens) + num(call.outputTokens);
      const cost = num(call.costUsd);

      month.calls++;
      month.tokens += tokens;
      month.costUsd += cost;
      if (isToday) {
        today.calls++;
        today.tokens += tokens;
        today.costUsd += cost;
      }

      const entry = perModel.get(model) ?? { model, calls: 0, tokens: 0, costUsd: 0 };
      entry.calls++;
      entry.tokens += tokens;
      entry.costUsd += cost;
      perModel.set(model, entry);
    }
  }

  return {
    today,
    month,
    byModel: [...perModel.values()].sort((a, b) => b.costUsd - a.costUsd),
    month0,
  };
}

export async function getUsageSummary(): Promise<UsageSummary> {
  const { monthStart, todayStart, month0 } = usageWindow();
  const runs = await db
    .select({ startedAt: agentRuns.startedAt, llmCalls: agentRuns.llmCalls })
    .from(agentRuns)
    .where(gte(agentRuns.startedAt, monthStart));

  return summarize(runs, todayStart, month0);
}

/**
 * A model's name as it should be said.
 *
 * "claude-haiku-4-5" read out is a string of English letters and digits in
 * the middle of a Japanese sentence, which is exactly the kind of thing the
 * speech layer exists to prevent. The family name in katakana cannot be
 * misread, and is what anyone would say anyway. An id from a family this
 * does not know is left alone rather than guessed at.
 */
const SPOKEN_MODELS: Array<[RegExp, string]> = [
  [/haiku/i, "ハイク"],
  [/sonnet/i, "ソネット"],
  [/opus/i, "オーパス"],
  [/fable/i, "フェイブル"],
];

export function spokenModelName(model: string): string {
  for (const [pattern, name] of SPOKEN_MODELS) {
    if (pattern.test(model)) return name;
  }
  return model;
}

function money(usd: number): string {
  // Below a cent, a rounded figure reads as zero and sounds like nothing
  // was used at all.
  if (usd > 0 && usd < 0.01) return "1セント未満";
  return `${usd.toFixed(2)}ドル`;
}

/**
 * The summary as a sentence, for saying out loud.
 *
 * Pure, so the wording is pinned down by tests rather than by reading it
 * back off a screen.
 */
export function describeUsage(summary: UsageSummary): string {
  const { today, month, byModel, month0 } = summary;

  if (month.calls === 0) {
    return `${month0}月はまだClaude APIを使っていません。`;
  }

  const parts = [
    `${month0}月のClaude API利用は${money(month.costUsd)}、` +
      `リクエスト${month.calls}回、${month.tokens.toLocaleString("ja-JP")}トークンです。`,
    today.calls === 0
      ? "今日はまだ使っていません。"
      : `今日は${money(today.costUsd)}、${today.calls}回です。`,
  ];

  // Only worth saying when there is actually a split to report.
  if (byModel.length > 1) {
    const top = byModel
      .slice(0, 3)
      .map((entry) => `${spokenModelName(entry.model)}が${money(entry.costUsd)}`)
      .join("、");
    parts.push(`内訳は${top}。`);
  }

  return parts.join("");
}
