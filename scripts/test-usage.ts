/**
 * Checks for the API-usage readout.
 *
 * The database half can only be judged against a database; what is asked
 * here is which questions reach it without a model call, and what the
 * answer sounds like once it has the numbers.
 */
process.env.CALENDAR_TIMEZONE_OFFSET = "+09:00";

import { detectsUsageQuestion } from "../src/lib/agents/intent";
import {
  describeUsage,
  spokenModelName,
  summarize,
  usageWindow,
  type UsageRun,
  type UsageSummary,
} from "../src/lib/agents/usage";

let failures = 0;
function check(name: string, condition: boolean, detail?: unknown) {
  if (condition) {
    console.log(`  ok  ${name}`);
  } else {
    failures++;
    console.log(`FAIL  ${name}${detail === undefined ? "" : `\n      got: ${JSON.stringify(detail)}`}`);
  }
}

// --- which questions skip the model entirely ---
for (const [question, expected] of [
  ["APIの使用状況は？", true],
  ["Claude APIの利用状況を教えて", true],
  ["今月のAPIコストは？", true],
  ["クロードにいくら使ってる？", true],
  ["トークンどれくらい消費してる？", true],
  ["API料金いくら？", true],
  ["claudeの課金状況", true],
  // Not about spending, and must not be hijacked by it.
  ["GmailのAPIの利用制限は？", false],
  ["Notion APIの使い方を教えて", false],
  ["明日の予定は？", false],
  ["今日は何日？", false],
  ["APIを叩くコードを書いて", false],
] as Array<[string, boolean]>) {
  check(`${expected ? "answers directly" : "goes to the model"}: ${question}`,
    detectsUsageQuestion(question) === expected, detectsUsageQuestion(question));
}

// --- what it says once it has the numbers ---
const summary: UsageSummary = {
  today: { calls: 21, runs: 9, tokens: 48_120, costUsd: 0.0832 },
  month: { calls: 342, runs: 120, tokens: 1_204_500, costUsd: 1.2431 },
  byModel: [
    { model: "claude-haiku-4-5", calls: 300, tokens: 900_000, costUsd: 0.9 },
    { model: "claude-opus-5", calls: 42, tokens: 304_500, costUsd: 0.3431 },
  ],
  month0: 9,
};

const spoken = describeUsage(summary);
console.log(`\n      → ${spoken}\n`);
check("names the month and the total", spoken.includes("9月") && spoken.includes("1.24ドル"), spoken);
check("gives the request count", spoken.includes("342回"), spoken);
check("groups the digits so they can be read", spoken.includes("1,204,500"), spoken);
check("reports today separately", spoken.includes("今日は0.08ドル、21回"), spoken);
check("breaks it down by model", spoken.includes("ハイクが0.90ドル") && spoken.includes("オーパスが0.34ドル"), spoken);
// Written to be said out loud: no markup, and no model id spelled out
// letter by letter in the middle of a Japanese sentence.
check("carries no markup", !/[*#`|]/.test(spoken), spoken);
check("says model names rather than spelling out ids", !/claude-/i.test(spoken), spoken);

const quiet = describeUsage({ ...summary, today: { calls: 0, runs: 0, tokens: 0, costUsd: 0 } });
check("says so when nothing was used today", quiet.includes("今日はまだ使っていません"), quiet);

const unused = describeUsage({
  today: { calls: 0, runs: 0, tokens: 0, costUsd: 0 },
  month: { calls: 0, runs: 0, tokens: 0, costUsd: 0 },
  byModel: [],
  month0: 9,
});
check("says so when the month is empty", unused === "9月はまだClaude APIを使っていません。", unused);

// A fraction of a cent rounds to zero, which reads as "nothing was used".
const tiny = describeUsage({
  ...summary,
  month: { calls: 3, runs: 1, tokens: 900, costUsd: 0.0004 },
  byModel: [{ model: "claude-haiku-4-5", calls: 3, tokens: 900, costUsd: 0.0004 }],
  today: { calls: 0, runs: 0, tokens: 0, costUsd: 0 },
});
check("does not round a real cost down to nothing", tiny.includes("1セント未満"), tiny);

const single = describeUsage({ ...summary, byModel: [summary.byModel[0]] });
check("skips the breakdown when there is only one model", !single.includes("内訳"), single);

for (const [id, said] of [
  ["claude-haiku-4-5", "ハイク"],
  ["claude-opus-5", "オーパス"],
  ["claude-sonnet-5", "ソネット"],
  // An id from a family this doesn't know is left as it is rather than guessed.
  ["some-future-model", "some-future-model"],
] as Array<[string, string]>) {
  check(`model name: ${id}`, spokenModelName(id) === said, spokenModelName(id));
}

// --- bucketing, and the day boundary it turns on ---

const run = (startedAt: string, llmCalls: unknown): UsageRun => ({
  startedAt: new Date(startedAt),
  llmCalls,
});
const call = (model: string, inputTokens: number, outputTokens: number, costUsd: number) => ({
  model, inputTokens, outputTokens, costUsd,
});

// JST midnight on the 20th is 15:00Z on the 19th. A run either side of that
// instant belongs to a different day, and getting it wrong would put an
// evening's usage on the wrong date.
const todayStart = new Date("2026-09-19T15:00:00Z");
const bucketed = summarize(
  [
    run("2026-09-19T14:59:59Z", [call("claude-haiku-4-5", 100, 50, 0.001)]),
    run("2026-09-19T15:00:00Z", [call("claude-haiku-4-5", 200, 100, 0.002)]),
    run("2026-09-20T02:00:00Z", [call("claude-opus-5", 400, 200, 0.05)]),
  ],
  todayStart,
  9
);
check("a run a second before JST midnight is not today", bucketed.today.runs === 2, bucketed.today.runs);
check("everything in the month is counted", bucketed.month.runs === 3, bucketed.month.runs);
check("today's calls exclude the earlier one", bucketed.today.calls === 2, bucketed.today.calls);
check("today's cost excludes it too", Math.abs(bucketed.today.costUsd - 0.052) < 1e-9, bucketed.today.costUsd);
check("the month's cost includes it", Math.abs(bucketed.month.costUsd - 0.053) < 1e-9, bucketed.month.costUsd);
check("tokens are input plus output", bucketed.month.tokens === 1050, bucketed.month.tokens);
check("the dearest model is listed first", bucketed.byModel[0].model === "claude-opus-5", bucketed.byModel);

// jsonb comes back as whatever was written, including by an older build or
// a run that died halfway. None of it may take out the report.
const survived = summarize(
  [
    run("2026-09-20T01:00:00Z", null),
    run("2026-09-20T01:00:00Z", "not an array"),
    run("2026-09-20T01:00:00Z", [{}, { model: 42, costUsd: "0.01" }]),
    run("2026-09-20T01:00:00Z", [call("claude-haiku-4-5", 10, 5, 0.001)]),
  ],
  todayStart,
  9
);
check("malformed rows do not throw", survived.month.runs === 4, survived.month.runs);
check("an unnamed model is grouped as unknown",
  survived.byModel.some((m) => m.model === "unknown"), survived.byModel);
check("a numeric string cost is still counted",
  Math.abs(survived.month.costUsd - 0.011) < 1e-9, survived.month.costUsd);
check("no NaN reaches the totals", Number.isFinite(survived.month.tokens), survived.month.tokens);

// The window is derived from the configured offset, not from UTC.
const window = usageWindow();
check("the month starts on the 1st in local time",
  window.monthStart.toISOString().endsWith("T15:00:00.000Z"), window.monthStart.toISOString());
check("the month number matches the local date",
  window.month0 === Number(new Date(Date.now() + 9 * 3600_000).toISOString().slice(5, 7)), window.month0);
check("today starts before now", window.todayStart.getTime() <= Date.now());

console.log(failures ? `\n${failures} failed` : "\nall passed");
process.exit(failures ? 1 : 0);
