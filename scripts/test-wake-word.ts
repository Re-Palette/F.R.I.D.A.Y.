/**
 * Checks for the wake-word matcher in src/lib/wake-word.ts.
 *
 * The recognition loop around it needs a microphone and can only be judged
 * by using it; what it decides on can be pinned down here — which
 * mishearings count as being called, which words must never wake it, and
 * how much of "フライデー、明日の予定は？" survives as the question.
 */
import { matchWakeWord } from "../src/lib/wake-word";

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

console.log(failures ? `\n${failures} failed` : `\nall ${cases.length} passed`);
process.exit(failures ? 1 : 0);
