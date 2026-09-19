/**
 * Checks for src/lib/speech-text.ts. Run with `pnpm test:speech`.
 *
 * A pronunciation table only grows, and every addition is a chance to break
 * a case that used to work — so the cases live here rather than being
 * re-checked by listening to the app.
 */
import assert from "node:assert/strict";
import { parseReadings, takeSentences, toSpeakable } from "../src/lib/speech-text";

const cases: Array<[string, string, string]> = [
  [
    "calendar: the fast path's own output",
    "明日の予定:\n- 14:00 打ち合わせ @ 渋谷\n- 9/20 10:00 〜 9/22 18:00 出張",
    "明日の予定。14時 打ち合わせ、渋谷。9月20日 10時から9月22日 18時 出張",
  ],
  ["time: a round hour drops the minutes", "9:00に開始", "9時に開始"],
  ["time: minutes are spoken", "10:30に集合", "10時30分に集合"],
  ["time: nonsense clocks are left alone", "得点は 25:99 だった", "得点は 25、99 だった"],
  ["date: ISO becomes words", "2026-09-18の件", "2026年9月18日の件"],
  ["date: slashes become words", "9/20に提出", "9月20日に提出"],
  ["date: a fraction is not a date", "進捗は 3/45 です", "進捗は 3/45 です"],
  ["number: thousands separators are silent", "費用は1,200円", "費用は1200円"],
  ["markdown: emphasis and headings go", "## 結論\n**重要**な点", "結論。重要な点"],
  ["markdown: bullets go", "- ひとつ\n- ふたつ", "ひとつ。ふたつ"],
  ["markdown: a link keeps its words", "詳細は[こちら](https://example.com)", "詳細はこちら"],
  ["markdown: code blocks go entirely", "実行:\n```\nrm -rf /\n```\n完了", "実行。完了"],
  ["url: bare links are not spelled out", "https://example.com/a/b を見て", "リンク を見て"],
  ["email: addresses are not spelled out", "tanaka@example.com から連絡", "メールアドレス から連絡"],
  ["emoji: removed", "完了しました ✅", "完了しました"],
  ["readings: its own name", "F.R.I.D.A.Y. が応答します", "フライデー が応答します"],
  ["empty stays empty", "   ", ""],
];

let failures = 0;
for (const [name, input, expected] of cases) {
  const actual = toSpeakable(input);
  if (actual === expected) {
    console.log(`  ok  ${name}`);
  } else {
    failures++;
    console.log(`FAIL  ${name}\n      in:       ${JSON.stringify(input)}`);
    console.log(`      expected: ${JSON.stringify(expected)}`);
    console.log(`      actual:   ${JSON.stringify(actual)}`);
  }
}

// Custom readings, which is how a name this app can't know gets said right.
const custom = [{ from: "Re-Palette", to: "リパレット" }];
const withCustom = toSpeakable("Re-Paletteの件", [...custom]);
assert.equal(withCustom, "リパレットの件");
console.log("  ok  readings: a configured term");

assert.deepEqual(parseReadings("A=あ, B=び\nC=しー"), [
  { from: "A", to: "あ" },
  { from: "B", to: "び" },
  { from: "C", to: "しー" },
]);
assert.deepEqual(parseReadings(undefined), []);
assert.deepEqual(parseReadings("nonsense,=x,y="), []);
console.log("  ok  readings: parsing");

// --- takeSentences: what can be spoken while the rest is still arriving ---

function sentences(name: string, input: string, flush: boolean, expected: string[], rest: string) {
  const actual = takeSentences(input, { flush });
  const ok =
    JSON.stringify(actual.sentences) === JSON.stringify(expected) && actual.rest === rest;
  if (ok) {
    console.log(`  ok  ${name}`);
  } else {
    failures++;
    console.log(`FAIL  ${name}`);
    console.log(`      expected: ${JSON.stringify({ sentences: expected, rest })}`);
    console.log(`      actual:   ${JSON.stringify(actual)}`);
  }
}

sentences("nothing complete yet", "明日は3件あ", false, [], "明日は3件あ");
sentences(
  "one finished, one still coming",
  "明日は3件あります。10時から企画",
  false,
  ["明日は3件あります。"],
  "10時から企画"
);
sentences("a question counts as an end", "どうしますか？ええと", false, ["どうしますか？"], "ええと");
sentences(
  "a closing bracket belongs to its sentence",
  "「了解しました。」次に",
  false,
  ["「了解しました。」"],
  "次に"
);
sentences(
  "a long sentence breaks at a clause rather than waiting",
  "本日は朝から会議が立て込んでおり、午後には外出の予定も入っていますので、移動の時間を",
  false,
  ["本日は朝から会議が立て込んでおり、午後には外出の予定も入っていますので、"],
  "移動の時間を"
);
sentences("a short unfinished clause waits", "はい、そうです", false, [], "はい、そうです");
sentences("flush takes what is left", "最後まで言い切らず", true, ["最後まで言い切らず"], "");
sentences("flush on an empty buffer says nothing", "   ", true, [], "");

console.log(failures ? `\n${failures} failed` : `\nall passed`);
process.exit(failures ? 1 : 0);
