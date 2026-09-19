/**
 * Checks for the wake-word matcher in src/lib/wake-word.ts.
 *
 * The recognition loop around it needs a microphone and can only be judged
 * by using it; what it decides on can be pinned down here — which
 * mishearings count as being called, which words must never wake it, and
 * how much of "フライデー、明日の予定は？" survives as the question.
 */
import { matchDismissal, matchWakeWord } from "../src/lib/wake-word";

const cases: Array<[string, string, boolean, string]> = [
  ["called by name", "フライデー", true, ""],
  ["called with feeling", "フライデー！", true, ""],
  ["a question in the same breath", "フライデー、明日の予定は？", true, "明日の予定は？"],
  ["spelled in hiragana", "ふらいでー 明日の天気", true, "明日の天気"],
  ["misheard as プライデー", "プライデーおはよう", true, "おはよう"],
  ["misheard as ブライデー", "ブライデー、ちょっといい？", true, "ちょっといい？"],
  ["half-width katakana", "ﾌﾗｲﾃﾞｰ", true, ""],
  ["in latin letters", "Hey Friday, what's up", true, "what's up"],
  ["mid-sentence still counts", "ねえフライデー、これ見て", true, "これ見て"],
  // The one that has to stay asleep: it is what the name means, it comes up
  // constantly, and waking on it would look like a fault.
  ["the day of the week does not wake it", "金曜日の予定を教えて", false, ""],
  ["ordinary speech does not wake it", "今日はいい天気だね", false, ""],
  ["a near miss does not wake it", "ブライダルフェアの件", false, ""],
];

let failures = 0;
for (const [name, input, matched, rest] of cases) {
  const actual = matchWakeWord(input);
  if (actual.matched === matched && actual.rest === rest) {
    console.log(`  ok  ${name}`);
  } else {
    failures++;
    console.log(`FAIL  ${name}\n      in:       ${JSON.stringify(input)}`);
    console.log(`      expected: ${JSON.stringify({ matched, rest })}`);
    console.log(`      actual:   ${JSON.stringify(actual)}`);
  }
}

// --- being dismissed: "ありがとうフライデー" ends the conversation ---

const dismissals: Array<[string, string, boolean]> = [
  ["thanked by name", "ありがとうフライデー", true],
  ["name first", "フライデーありがとう", true],
  ["with a comma", "ありがとう、フライデー", true],
  ["politely", "ありがとうございますフライデー", true],
  ["politely, past tense", "フライデー、ありがとうございました", true],
  ["just thanks", "ありがとう", true],
  ["just thanks, politely", "ありがとうございます", true],
  ["with a filler in front", "どうもありがとうフライデー", true],
  ["in katakana", "サンキューフライデー", true],
  ["in english", "Thanks Friday", true],
  // The ones that must not end the conversation: thanks is a common way to
  // open a request, and an errand about thanking someone is not a goodbye.
  ["thanks then a question", "ありがとう、ところで明日の予定は？", false],
  ["an errand containing thanks", "田中さんにありがとうと伝えて", false],
  ["thanks inside a longer sentence", "資料ありがとう、あと請求書も送っておいて", false],
  ["the name alone is a greeting, not a goodbye", "フライデー", false],
  ["an ordinary request", "明日の予定は？", false],
];

for (const [name, input, expected] of dismissals) {
  const actual = matchDismissal(input);
  if (actual === expected) {
    console.log(`  ok  dismissal: ${name}`);
  } else {
    failures++;
    console.log(`FAIL  dismissal: ${name}`);
    console.log(`      in:       ${JSON.stringify(input)}`);
    console.log(`      expected: ${expected}  actual: ${actual}`);
  }
}

const total = cases.length + dismissals.length;
console.log(failures ? `\n${failures} failed` : `\nall ${total} passed`);
process.exit(failures ? 1 : 0);
