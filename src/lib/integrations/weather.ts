/**
 * Weather for the panel in the top-right corner.
 *
 * Open-Meteo, because it needs no key and no account: every other provider
 * would be one more secret to mint, paste into Vercel and keep alive, for a
 * readout that says what the sky is doing. Non-commercial use is free and
 * unauthenticated.
 *
 * The parsing is deliberately suspicious of what comes back. A weather panel
 * that says nothing is a weather panel that is honest about not knowing;
 * one that throws takes the whole screen with it.
 */

const ENDPOINT = "https://api.open-meteo.com/v1/forecast";

/** How long a reading is worth reusing. The sky is not that fast. */
const CACHE_MS = 10 * 60 * 1000;

export type Sky =
  | "clear"
  | "partly"
  | "cloud"
  | "fog"
  | "drizzle"
  | "rain"
  | "snow"
  | "thunder";

/**
 * WMO weather codes, which is what Open-Meteo reports, grouped into the
 * handful of pictures worth drawing. Anything unrecognised is cloud — the
 * least wrong guess for a code this doesn't know.
 */
const SKY_BY_CODE: Record<number, Sky> = {
  0: "clear",
  1: "clear",
  2: "partly",
  3: "cloud",
  45: "fog",
  48: "fog",
  51: "drizzle",
  53: "drizzle",
  55: "drizzle",
  56: "drizzle",
  57: "drizzle",
  61: "rain",
  63: "rain",
  65: "rain",
  66: "rain",
  67: "rain",
  71: "snow",
  73: "snow",
  75: "snow",
  77: "snow",
  80: "rain",
  81: "rain",
  82: "rain",
  85: "snow",
  86: "snow",
  95: "thunder",
  96: "thunder",
  99: "thunder",
};

const LABELS: Record<Sky, string> = {
  clear: "晴れ",
  partly: "晴れ時々くもり",
  cloud: "くもり",
  fog: "霧",
  drizzle: "小雨",
  rain: "雨",
  snow: "雪",
  thunder: "雷雨",
};

export function skyOf(code: unknown): Sky {
  return (typeof code === "number" && SKY_BY_CODE[code]) || "cloud";
}

export function labelOf(sky: Sky): string {
  return LABELS[sky];
}

export interface WeatherDay {
  /** SUN, MON… taken from the date rather than from counting forward. */
  day: string;
  sky: Sky;
  high: number;
  low: number;
}

export interface WeatherReport {
  place: string;
  temperature: number;
  sky: Sky;
  label: string;
  isDay: boolean;
  days: WeatherDay[];
}

const DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

function weekdayOf(date: string): string {
  // Date-only strings parse as UTC midnight, so the UTC weekday is the
  // weekday of the date as written — which is the local date Open-Meteo was
  // asked for.
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? "---" : DAYS[parsed.getUTCDay()];
}

function numbersAt(source: unknown, index: number): number | null {
  if (!Array.isArray(source)) return null;
  const value = source[index];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Turns Open-Meteo's response into what the panel draws, or null if it is
 * not the shape this expects. Separated from the request so it can be tested
 * without one.
 */
export function parseForecast(payload: unknown, place: string): WeatherReport | null {
  if (!payload || typeof payload !== "object") return null;
  const body = payload as {
    current?: { temperature_2m?: unknown; weather_code?: unknown; is_day?: unknown };
    daily?: {
      time?: unknown;
      weather_code?: unknown;
      temperature_2m_max?: unknown;
      temperature_2m_min?: unknown;
    };
  };

  const temperature = body.current?.temperature_2m;
  if (typeof temperature !== "number" || !Number.isFinite(temperature)) return null;

  const times = body.daily?.time;
  if (!Array.isArray(times) || times.length === 0) return null;

  const days: WeatherDay[] = [];
  for (let i = 0; i < Math.min(times.length, 4); i++) {
    const date = times[i];
    const high = numbersAt(body.daily?.temperature_2m_max, i);
    const low = numbersAt(body.daily?.temperature_2m_min, i);
    // A day missing its numbers is dropped rather than shown as a dash: the
    // row is four characters wide and a gap in it reads as a fault.
    if (typeof date !== "string" || high === null || low === null) continue;
    days.push({
      day: weekdayOf(date),
      sky: skyOf(numbersAt(body.daily?.weather_code, i)),
      high: Math.round(high),
      low: Math.round(low),
    });
  }
  if (days.length === 0) return null;

  const sky = skyOf(body.current?.weather_code);
  return {
    place,
    temperature: Math.round(temperature),
    sky,
    label: labelOf(sky),
    isDay: body.current?.is_day !== 0,
    days,
  };
}

let cached: { at: number; report: WeatherReport } | null = null;

export function weatherPlace(): string {
  return process.env.WEATHER_PLACE || "TOKYO";
}

/**
 * Fetches the forecast, reusing a recent one.
 *
 * The cache is per warm serverless instance, which is exactly the right
 * scope: it spares a repeatedly-open dashboard a request a minute without
 * any of them ever going stale by more than the interval.
 */
export async function getWeather(): Promise<WeatherReport | null> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.report;

  const latitude = process.env.WEATHER_LATITUDE || "35.6785";
  const longitude = process.env.WEATHER_LONGITUDE || "139.6823";
  const timezone = process.env.WEATHER_TIMEZONE || "Asia/Tokyo";

  const url =
    `${ENDPOINT}?latitude=${encodeURIComponent(latitude)}&longitude=${encodeURIComponent(longitude)}` +
    `&current=temperature_2m,weather_code,is_day` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min` +
    `&timezone=${encodeURIComponent(timezone)}&forecast_days=4`;

  // Explicitly uncached. Next patches fetch in route handlers, and a forecast
  // quietly held in a framework cache would freeze the panel on whatever the
  // sky was doing when the instance started — the ten-minute cache above is
  // the only one this should have.
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
  if (!res.ok) {
    throw new Error(`Open-Meteo ${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}`);
  }

  const report = parseForecast(await res.json(), weatherPlace());
  if (!report) throw new Error("Open-Meteo returned an unexpected shape.");

  cached = { at: Date.now(), report };
  return report;
}
