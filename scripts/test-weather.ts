/**
 * Checks for the forecast parsing in src/lib/integrations/weather.ts.
 *
 * The request itself can only be judged against the live service; what it
 * comes back with, and what happens when it comes back wrong, is decided
 * here — including that a malformed payload produces nothing rather than a
 * panel full of NaN.
 */
import assert from "node:assert/strict";
import { labelOf, parseForecast, skyOf } from "../src/lib/integrations/weather";

let failures = 0;
function check(name: string, condition: boolean, detail?: unknown) {
  if (condition) {
    console.log(`  ok  ${name}`);
  } else {
    failures++;
    console.log(`FAIL  ${name}${detail === undefined ? "" : `\n      ${JSON.stringify(detail)}`}`);
  }
}

// A response in the shape Open-Meteo documents for
// current=temperature_2m,weather_code,is_day and
// daily=weather_code,temperature_2m_max,temperature_2m_min.
const payload = {
  latitude: 35.68,
  longitude: 139.68,
  timezone: "Asia/Tokyo",
  current: { time: "2026-09-19T10:45", temperature_2m: 24.4, weather_code: 3, is_day: 1 },
  daily: {
    time: ["2026-09-19", "2026-09-20", "2026-09-21", "2026-09-22"],
    weather_code: [3, 61, 0, 95],
    temperature_2m_max: [28.4, 26.9, 30.1, 27.2],
    temperature_2m_min: [21.6, 20.4, 22.8, 21.1],
  },
};

const report = parseForecast(payload, "TOKYO");
check("a documented response parses", report !== null);
if (report) {
  check("temperature is rounded", report.temperature === 24, report.temperature);
  check("current sky comes from the code", report.sky === "cloud", report.sky);
  check("daytime is read from is_day", report.isDay === true);
  check("four days come back", report.days.length === 4, report.days.length);
  // 2026-09-19 is a Saturday; the weekday must come from the date rather
  // than from counting forward off today.
  check("the weekday is taken from the date", report.days[0].day === "SAT", report.days[0].day);
  check("the days that follow it are right",
    report.days.map((d) => d.day).join(",") === "SAT,SUN,MON,TUE",
    report.days.map((d) => d.day));
  check("highs and lows are rounded", report.days[0].high === 28 && report.days[0].low === 22,
    [report.days[0].high, report.days[0].low]);
  check("each day gets its own sky",
    report.days.map((d) => d.sky).join(",") === "cloud,rain,clear,thunder",
    report.days.map((d) => d.sky));
}

// Nothing here may throw, and nothing may produce a panel of NaN.
for (const [name, bad] of [
  ["null", null],
  ["a string", "nope"],
  ["an error body", { error: true, reason: "Invalid latitude" }],
  ["no current temperature", { current: {}, daily: payload.daily }],
  ["a non-numeric temperature", { current: { temperature_2m: "24.4" }, daily: payload.daily }],
  ["no daily block", { current: payload.current }],
  ["an empty day list", { current: payload.current, daily: { time: [] } }],
  ["days with no numbers", { current: payload.current, daily: { time: ["2026-09-19"] } }],
] as Array<[string, unknown]>) {
  let result: unknown = "threw";
  try {
    result = parseForecast(bad, "TOKYO");
  } catch {
    // leave it as "threw"
  }
  check(`rejected without throwing: ${name}`, result === null, result);
}

check("an unknown weather code falls back to cloud", skyOf(1234) === "cloud");
check("a missing weather code falls back to cloud", skyOf(undefined) === "cloud");
check("code 0 is clear", skyOf(0) === "clear");
check("code 71 is snow", skyOf(71) === "snow");
check("every sky has a label", labelOf(skyOf(95)) === "雷雨", labelOf(skyOf(95)));

assert.equal(typeof labelOf("clear"), "string");

console.log(failures ? `\n${failures} failed` : "\nall passed");
process.exit(failures ? 1 : 0);
