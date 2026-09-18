/**
 * Google Calendar (read-only). FRIDAY has no login screen, so this does
 * not use an in-app OAuth flow — a refresh token is minted once via
 * `pnpm calendar:get-token` (see scripts/get-google-refresh-token.ts) and
 * stored as an env var. This module only ever exchanges that refresh
 * token for short-lived access tokens server-side.
 *
 * Japan does not observe DST, so day boundaries use a fixed UTC offset
 * (CALENDAR_TIMEZONE_OFFSET, default "+09:00") rather than full IANA
 * timezone/DST resolution — accurate for the intended use and much
 * simpler. Revisit if FRIDAY is ever used outside a fixed-offset zone.
 */

interface CachedToken {
  token: string;
  expiresAt: number;
}

let cachedToken: CachedToken | null = null;

export function isGoogleCalendarConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CALENDAR_CLIENT_ID &&
      process.env.GOOGLE_CALENDAR_CLIENT_SECRET &&
      process.env.GOOGLE_CALENDAR_REFRESH_TOKEN
  );
}

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.token;
  }

  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_CALENDAR_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Google Calendar is not configured. See .env.example.");
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Google token refresh failed: HTTP ${res.status}`);

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cachedToken.token;
}

export interface CalendarEvent {
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location?: string;
  /** Which calendar it came from — set only for calendars other than the primary one. */
  calendar?: string;
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
    calendar: cal.primary ? undefined : cal.summary,
  }));
}

/** Instant an event begins, so all-day entries sort to the head of their day. */
function startsAt(e: CalendarEvent): number {
  if (!e.allDay) return new Date(e.start).getTime();
  return new Date(`${e.start}T00:00:00.000Z`).getTime() - offsetMinutes() * 60_000;
}

/** timeMin/timeMax are full ISO instants (UTC). Covers every visible calendar. */
export async function listEvents(timeMin: string, timeMax: string): Promise<CalendarEvent[]> {
  const token = await getAccessToken();
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

  return perCalendar.flat().sort((a, b) => startsAt(a) - startsAt(b));
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

export function formatEventLine(e: CalendarEvent): string {
  const source = e.calendar ? `［${e.calendar}］` : "";
  if (e.allDay) return `- ${e.title}（終日）${e.location ? ` @ ${e.location}` : ""}${source}`;
  // Shift the instant by the configured offset so the UTC getters read local
  // wall-clock time, as localDateString does. Reading them off the raw
  // instant printed every event in UTC — a 14:00 meeting in Tokyo showed as
  // 05:00.
  const local = new Date(new Date(e.start).getTime() + offsetMinutes() * 60_000);
  const time = `${String(local.getUTCHours()).padStart(2, "0")}:${String(local.getUTCMinutes()).padStart(2, "0")}`;
  return `- ${time} ${e.title}${e.location ? ` @ ${e.location}` : ""}${source}`;
}
