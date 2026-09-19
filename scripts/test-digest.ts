/**
 * Checks for the daily digest's parsing in src/lib/agents/digest.ts.
 *
 * The model is asked for a strict format and will sometimes not give one.
 * What matters is that a day's worth of thinking survives that — losing the
 * lot because a bracket is missing would be the wrong trade — so these are
 * mostly about salvaging.
 */
import { buildTranscript, parseDigest } from "../src/lib/agents/digest";

let failures = 0;
function check(name: string, condition: boolean, detail?: unknown) {
  if (condition) console.log(`  ok  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail === undefined ? "" : `\n      got: ${JSON.stringify(detail)}`}`);
  }
}

const wellFormed = `## レポート
朝は請求書の件。A社への見積もりを今週中に送ると決めた。

### 採用
面接の日程調整は保留のまま。

## 記憶
- [decision|4] A社への見積もりは今週中に送る
- [preference|3] 長文よりも箇条書きより、短い会話で伝えてほしい
- [entity|2] 田中さんはA社の窓口
`;

const parsed = parseDigest(wellFormed);
check("the report keeps its body", parsed.report.includes("A社への見積もり"), parsed.report);
check("the report keeps its sub-headings", parsed.report.includes("### 採用"), parsed.report);
check("the report drops its own heading", !parsed.report.includes("## レポート"), parsed.report);
check("the report does not swallow the memories", !parsed.report.includes("[decision"), parsed.report);
check("every memory is found", parsed.memories.length === 3, parsed.memories);
check("types are read", parsed.memories.map((m) => m.type).join(",") === "decision,preference,entity", parsed.memories);
check("weights are read", parsed.memories.map((m) => m.importance).join(",") === "4,3,2", parsed.memories);
check("content is kept whole", parsed.memories[2].content === "田中さんはA社の窓口", parsed.memories[2]);

// --- what happens when the format slips ---
const loose = parseDigest(`## レポート
今日は特に何も決まらなかった。

## 記憶
- [preference] 朝は静かにしてほしい
- 形式を無視した行
* [fact|9] 重要度が範囲外
- [nonsense|2] 知らない種類
- [fact|3]
`);
check("a missing weight defaults rather than dropping the line",
  loose.memories.some((m) => m.content === "朝は静かにしてほしい" && m.importance === 2), loose.memories);
check("a line with no brackets is skipped",
  !loose.memories.some((m) => m.content === "形式を無視した行"), loose.memories);
check("an out-of-range weight is clamped",
  loose.memories.some((m) => m.content === "重要度が範囲外" && m.importance === 5), loose.memories);
check("an unknown type becomes a fact",
  loose.memories.some((m) => m.content === "知らない種類" && m.type === "fact"), loose.memories);
check("an empty memory is not stored",
  loose.memories.every((m) => m.content.length > 0), loose.memories);

// The model ignored the format entirely: the write-up still has to survive.
const noSections = parseDigest("今日は請求書の話をした。それだけ。");
check("a report with no headings is kept", noSections.report === "今日は請求書の話をした。それだけ。", noSections.report);
check("and yields no memories", noSections.memories.length === 0, noSections.memories);

const noMemories = parseDigest("## レポート\n何も無し。\n\n## 記憶\n");
check("an empty memory section is fine", noMemories.memories.length === 0, noMemories.memories);
check("and the report is still there", noMemories.report === "何も無し。", noMemories.report);

// --- the transcript handed to the model ---
const transcript = buildTranscript([
  { title: "請求書の件", role: "user", content: "A社の見積もりまだ？" },
  { title: "請求書の件", role: "assistant", content: "まだ送っていません。" },
  { title: null, role: "user", content: "ありがとう" },
]);
check("messages are grouped under their conversation", transcript.includes("### 請求書の件"), transcript);
check("an untitled conversation still appears", transcript.includes("（無題）"), transcript);
check("who said what is preserved",
  transcript.includes("ユーザー: A社の見積もりまだ？") && transcript.includes("F.R.I.D.A.Y.: まだ送っていません。"),
  transcript);

// A runaway answer must not blow the context window.
const huge = buildTranscript([{ title: "調査", role: "assistant", content: "あ".repeat(40_000) }]);
check("an enormous day is truncated", huge.length < 25_000, huge.length);
check("and says that it was", huge.startsWith("…（前略）"), huge.slice(0, 20));
check("keeping the end rather than the start", huge.endsWith("あ"), huge.slice(-10));

console.log(failures ? `\n${failures} failed` : "\nall passed");
process.exit(failures ? 1 : 0);
