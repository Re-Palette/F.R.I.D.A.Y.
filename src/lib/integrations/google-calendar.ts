/**
 * Google Calendar (read-only). FRIDAY has no login screen, so this does
 * not use an in-app OAuth flow — a refresh token is minted once per Google
 * account and stored as an env var. This module only ever exchanges those
 * refresh tokens for short-lived access tokens server-side.
 *
 * Several accounts can be read at once (a personal calendar alongside a
 * work one): GOOGLE_CALENDAR_REFRESH_TOKEN plus any
 * GOOGLE_CALENDAR_REFRESH_TOKEN_2, _3, ... They share one OAuth client —
 * only the account that authorized each token differs.
 *
 * Japan does not observe DST, so day boundaries use a fixed UTC offset
 * (CALENDAR_TIMEZONE_OFFSET, default "+09:00") rather than full IANA
 * timezone/DST resolution — accurate for the intended use and much
 * simpler. Revisit if FRIDAY is ever used outside a fixed-offset zone.
 */

import { googleAccessToken, googleClientCredentials } from "./google-oauth";

/** Every configured account's refresh token, the default account first. */
function refreshTokens(): string[] {
  const numbered = Object.keys(process.env)
    .filter((key) => /^GOOGLE_CALENDAR_REFRESH_TOKEN_\d+$/.test(key))
    .sort((a, b) => Number(a.slice(a.lastIndexOf("_") + 1)) - Number(b.slice(b.lastIndexOf("_") + 1)))
    .map((key) => process.env[key])
    .filter((value): value is string => Boolean(value));

  const first = process.env.GOOGLE_CALENDAR_REFRESH_TOKEN;
  return first ? [first, ...numbered] : numbered;
}

export function isGoogleCalendarConfigured(): boolean {
  return Boolean(googleClientCredentials() && refreshTokens().length);
}

export interface CalendarEvent {
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location?: string;
}

interface CalendarRef {
  id: string;
  summary: string;
  primary: boolean;
}

// Google's generated calendars answer "what day is it", not "what am I
// doing" — listing 敬老の日 under 明日の予定 is noise.
const GENERATED_CALENDAR = /#(holiday|contacts|weeknum)@group\.v\.calendar\.google\.com$/;

/** Every calendar the user actually sees: shared and subscribed ones included. */
async function listCalendars(token: string): Promise<CalendarRef[]> {
  const res = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Google Calendar API error: HTTP ${res.status}`);

  const data = (await res.json()) as {
    items?: Array<{
      id: string;
      summary?: string;
      primary?: boolean;
      selected?: boolean;
      deleted?: boolean;
    }>;
  };

  return (data.items ?? [])
    // `selected: false` means the user has unticked it in Google Calendar —
    // respect that rather than surfacing what they chose to hide.
    .filter((c) => !c.deleted && c.selected !== false && !GENERATED_CALENDAR.test(c.id))
    .map((c) => ({ id: c.id, summary: c.summary ?? c.id, primary: Boolean(c.primary) }));
}

async function listCalendarEvents(
  token: string,
  cal: CalendarRef,
  timeMin: string,
  timeMax: string
): Promise<CalendarEvent[]> {
  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "50",
  });

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal.id)}/events?${params}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error(`Google Calendar API error: HTTP ${res.status}`);

  const data = (await res.json()) as {
    items?: Array<{
      summary?: string;
      location?: string;
      start?: { dateTime?: string; date?: string };
      end?: { dateTime?: string; date?: string };
    }>;
  };

  return (data.items ?? []).map((item) => ({
    title: item.summary ?? "(無題の予定)",
    start: item.start?.dateTime ?? item.start?.date ?? "",
    end: item.end?.dateTime ?? item.end?.date ?? "",
    allDay: !item.start?.dateTime,
    location: item.location,
  }));
}

/** Instant an event begins, so all-day entries sort to the head of their day. */
function startsAt(e: CalendarEvent): number {
  if (!e.allDay) return new Date(e.start).getTime();
  return new Date(`${e.start}T00:00:00.000Z`).getTime() - offsetMinutes() * 60_000;
}

async function listAccountEvents(
  refreshToken: string,
  timeMin: string,
  timeMax: string
): Promise<CalendarEvent[]> {
  const token = await googleAccessToken(refreshToken);
  const calendars = await listCalendars(token);

  const perCalendar = await Promise.all(
    calendars.map(async (cal) => {
      try {
        return await listCalendarEvents(token, cal, timeMin, timeMax);
      } catch (err) {
        // One calendar the token can list but not read shouldn't blank out
        // the rest of the day's answer.
        console.error(`Failed to read calendar ${cal.id}:`, err);
        return [] as CalendarEvent[];
      }
    })
  );

  return perCalendar.flat();
}

/**
 * timeMin/timeMax are full ISO instants (UTC). Covers every visible calendar
 * of every configured account.
 */
export async function listEvents(timeMin: string, timeMax: string): Promise<CalendarEvent[]> {
  const tokens = refreshTokens();
  if (!tokens.length) throw new Error("Google Calendar is not configured. See .env.example.");

  const settled = await Promise.allSettled(
    tokens.map((refreshToken) => listAccountEvents(refreshToken, timeMin, timeMax))
  );

  settled.forEach((result, i) => {
    if (result.status === "rejected") {
      console.error(`Failed to read Google Calendar account #${i + 1}:`, result.reason);
    }
  });

  // One revoked account shouldn't hide the others, but every account failing
  // is an outage — reporting that as a free day would be a lie.
  if (settled.every((result) => result.status === "rejected")) {
    throw (settled[0] as PromiseRejectedResult).reason;
  }

  return settled
    .flatMap((result) => (result.status === "fulfilled" ? result.value : []))
    .sort((a, b) => startsAt(a) - startsAt(b));
}

function offsetMinutes(): number {
  const offset = process.env.CALENDAR_TIMEZONE_OFFSET ?? "+09:00";
  const match = /^([+-])(\d{2}):(\d{2})$/.exec(offset);
  if (!match) return 9 * 60;
  const sign = match[1] === "-" ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3]));
}

/**
 * UTC instant range covering local calendar day(s) [startDate, endDate)
 * for the configured fixed offset. Dates are "YYYY-MM-DD"; endDate
 * defaults to the day after startDate (a single day).
 */
export function localDateRangeToUtc(startDate: string, endDate?: string): { timeMin: string; timeMax: string } {
  const offsetMs = offsetMinutes() * 60_000;
  const start = new Date(`${startDate}T00:00:00.000Z`).getTime() - offsetMs;
  const endDay = endDate ?? addDays(startDate, 1);
  const end = new Date(`${endDay}T00:00:00.000Z`).getTime() - offsetMs;
  return { timeMin: new Date(start).toISOString(), timeMax: new Date(end).toISOString() };
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" for today (or today+offsetDays) in the configured local timezone. */
export function localDateString(offsetDays = 0): string {
  const offsetMs = offsetMinutes() * 60_000;
  const local = new Date(Date.now() + offsetMs);
  local.setUTCDate(local.getUTCDate() + offsetDays);
  return local.toISOString().slice(0, 10);
}

/**
 * Local calendar date and wall-clock time of an instant. Shifting by the
 * configured offset lets the UTC getters read local time, as localDateString
 * does; reading them off the raw instant printed everything in UTC — a 14:00
 * meeting in Tokyo showed as 05:00.
 */
function localParts(iso: string) {
  const d = new Date(new Date(iso).getTime() + offsetMinutes() * 60_000);
  const month = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  const hour = d.getUTCHours();
  const minute = d.getUTCMinutes();
  return {
    date: d.toISOString().slice(0, 10),
    monthDay: `${month}/${day}`,
    time: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    /** The same moment as it would be said rather than written. */
    spokenDate: `${month}月${day}日`,
    spokenTime: minute === 0 ? `${hour}時` : `${hour}時${minute}分`,
  };
}

/**
 * The day's schedule as a sentence.
 *
 * formatEventLine below writes the same events as a list, which is right
 * where the reader is the model — structure is what it needs to reason over.
 * This is for the other direction: answers that go straight to the user
 * without a model in between. Read out, a list is a list — "ハイフン、14時、
 * 打ち合わせ" — and asking what's on tomorrow should be answered the way a
 * person would answer it.
 */
export function describeEvents(label: string, events: CalendarEvent[]): string {
  if (!events.length) return `${label}の予定はありません。`;

  const described = events.map(describeEvent);
  if (described.length === 1) return `${label}は${described[0]}です。`;

  return `${label}は${described.length}件あります。${described.join("、")}です。`;
}

function describeEvent(e: CalendarEvent): string {
  const where = e.location ? `${e.location}で` : "";
  if (e.allDay) return `終日${where}${e.title}`;

  const start = localParts(e.start);
  const end = e.end ? localParts(e.end) : null;

  // A multi-day event asked about mid-run would otherwise be announced at
  // its start time, as if it began today.
  if (end && end.date !== start.date) {
    return `${start.spokenDate}の${start.spokenTime}から${end.spokenDate}の${end.spokenTime}まで${where}${e.title}`;
  }

  return `${start.spokenTime}から${where}${e.title}`;
}

/** One event as a line, for the model to read — see describeEvents for the user. */
export function formatEventLine(e: CalendarEvent): string {
  const where = e.location ? ` @ ${e.location}` : "";
  if (e.allDay) return `- ${e.title}（終日）${where}`;

  const start = localParts(e.start);
  const end = e.end ? localParts(e.end) : null;

  // Google returns any event overlapping the queried day, so a multi-day
  // event asked about mid-run would otherwise show only its start time and
  // read as if it began today. Spell out the span when there is one.
  const when =
    end && end.date !== start.date
      ? `${start.monthDay} ${start.time} 〜 ${end.monthDay} ${end.time}`
      : start.time;

  return `- ${when} ${e.title}${where}`;
}
