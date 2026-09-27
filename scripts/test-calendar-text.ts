/**
 * Checks for describeEvents in src/lib/integrations/google-calendar.ts —
 * the answer to "明日の予定は？" as it actually reaches the user, with no
 * model in between to turn it into sentences.
 */
process.env.CALENDAR_TIMEZONE_OFFSET = "+09:00";

import { describeEvents, type CalendarEvent } from "../src/lib/integrations/google-calendar";

const ev = (over: Partial<CalendarEvent>): CalendarEvent => ({
  title: "打ち合わせ",
  // 05:00Z is 14:00 in Tokyo — the offset is the whole point of these.
  start: "2026-09-19T05:00:00Z",
  end: "2026-09-19T06:00:00Z",
  allDay: false,
  ...over,
});

const cases: Array<[string, CalendarEvent[], string]> = [
  ["nothing on", [], "明日の予定はありません。"],
  ["one, with a place", [ev({ location: "渋谷" })], "明日は14時から渋谷で打ち合わせです。"],
  ["one, no place", [ev({})], "明日は14時から打ち合わせです。"],
  [
    "a time that isn't on the hour",
    [ev({ start: "2026-09-19T07:30:00Z", title: "定例" })],
    "明日は16時30分から定例です。",
  ],
  [
    "all day",
    [ev({ allDay: true, title: "夏季休暇", start: "2026-09-19", end: "2026-09-20" })],
    "明日は終日夏季休暇です。",
  ],
  [
    "three of them, counted and listed as speech",
    [
      ev({ start: "2026-09-19T01:00:00Z", title: "企画会議" }),
      ev({ location: "渋谷" }),
      ev({ start: "2026-09-19T07:30:00Z", title: "定例" }),
    ],
    "明日は3件あります。10時から企画会議、14時から渋谷で打ち合わせ、16時30分から定例です。",
  ],
  [
    "one that runs past midnight is given its span",
    [ev({ start: "2026-09-20T01:00:00Z", end: "2026-09-22T09:00:00Z", title: "出張" })],
    "明日は9月20日の10時から9月22日の18時まで出張です。",
  ],
];

let failures = 0;
for (const [name, events, expected] of cases) {
  const actual = describeEvents("明日", { events, unavailable: 0 });
  if (actual === expected) {
    console.log(`  ok  ${name}`);
  } else {
    failures++;
    console.log(`FAIL  ${name}`);
    console.log(`      expected: ${expected}`);
    console.log(`      actual:   ${actual}`);
  }
}

// An account that could not be read must be admitted to, not quietly
// dropped: two of four meetings presented as the whole day is how someone
// misses one.
const partial = describeEvents("明日", {
  events: [ev({ location: "渋谷" })],
  unavailable: 1,
});
if (partial.includes("読み取れていない")) {
  console.log("  ok  a partial read says so");
} else {
  failures++;
  console.log(`FAIL  a partial read says so\n      got: ${partial}`);
}

const emptyButBroken = describeEvents("明日", { events: [], unavailable: 1 });
if (emptyButBroken.includes("読み取れていない")) {
  console.log("  ok  an empty-but-broken day is not reported as free");
} else {
  failures++;
  console.log(`FAIL  an empty-but-broken day is not reported as free\n      got: ${emptyButBroken}`);
}

const clean = describeEvents("明日", { events: [ev({})], unavailable: 0 });
if (!clean.includes("読み取れていない")) {
  console.log("  ok  a complete read carries no caveat");
} else {
  failures++;
  console.log(`FAIL  a complete read carries no caveat\n      got: ${clean}`);
}

console.log(failures ? `\n${failures} failed` : `\nall ${cases.length + 3} passed`);
process.exit(failures ? 1 : 0);
