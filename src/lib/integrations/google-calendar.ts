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

interface CachedToken {
  token: string;
  expiresAt: number;
}

// Keyed by refresh token: each account's access token expires separately.
const tokenCache = new Map<string, CachedToken>();

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
  return Boolean(
    process.env.GOOGLE_CALENDAR_CLIENT_ID &&
      process.env.GOOGLE_CALENDAR_CLIENT_SECRET &&
      refreshTokens().length
  );
}

async function getAccessToken(refreshToken: string): Promise<string> {
  const cached = tokenCache.get(refreshToken);
  if (cached && cached.expiresAt > Date.now() + 30_000) return cached.token;

  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
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
  tokenCache.set(refreshToken, {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  });
  return data.access_token;
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
  isDefaultAccount: boolean,
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
    // A second account's own calendar is named after that account, so
    // labelling it is what makes "whose calendar is this?" answerable.
    calendar: cal.primary && isDefaultAccount ? undefined : cal.summary,
  }));
}

/** Instant an event begins, so all-day entries sort to the head of their day. */
function startsAt(e: CalendarEvent): number {
  if (!e.allDay) return new Date(e.start).getTime();
  return new Date(`${e.start}T00:00:00.000Z`).getTime() - offsetMinutes() * 60_000;
}

async function listAccountEvents(
  refreshToken: string,
  isDefaultAccount: boolean,
  timeMin: string,
  timeMax: string
): Promise<CalendarEvent[]> {
  const token = await getAccessToken(refreshToken);
  const calendars = await listCalendars(token);

  const perCalendar = await Promise.all(
    calendars.map(async (cal) => {
      try {
        return await listCalendarEvents(token, cal, isDefaultAccount, timeMin, timeMax);
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
    tokens.map((refreshToken, i) => listAccountEvents(refreshToken, i === 0, timeMin, timeMax))
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
  return {
    date: d.toISOString().slice(0, 10),
    monthDay: `${d.getUTCMonth() + 1}/${d.getUTCDate()}`,
    time: `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`,
  };
}

export function formatEventLine(e: CalendarEvent): string {
  const source = e.calendar ? `［${e.calendar}］` : "";
  const where = e.location ? ` @ ${e.location}` : "";
  if (e.allDay) return `- ${e.title}（終日）${where}${source}`;

  const start = localParts(e.start);
  const end = e.end ? localParts(e.end) : null;

  // Google returns any event overlapping the queried day, so a multi-day
  // event asked about mid-run would otherwise show only its start time and
  // read as if it began today. Spell out the span when there is one.
  const when =
    end && end.date !== start.date
      ? `${start.monthDay} ${start.time} 〜 ${end.monthDay} ${end.time}`
      : start.time;

  return `- ${when} ${e.title}${where}${source}`;
}
