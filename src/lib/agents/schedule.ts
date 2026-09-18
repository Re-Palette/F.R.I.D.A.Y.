/**
 * When a scheduled task next comes due.
 *
 * Everything here works in the configured fixed offset (Japan has no DST, so
 * an offset is enough — the same simplification the calendar integration
 * makes). The trick throughout is to shift an instant by the offset and then
 * read its UTC fields, which makes them read as local wall-clock.
 *
 * Pure on purpose: this is the part most likely to be subtly wrong, and
 * keeping it free of the database means it can be tested exhaustively.
 */

export type ScheduleKind = "once" | "daily" | "weekly" | "monthly";

export interface Schedule {
  kind: ScheduleKind;
  /** "HH:MM" local. */
  timeOfDay: string;
  /** 0 = Sunday. Weekly only. */
  weekday?: number | null;
  /** Monthly only. */
  dayOfMonth?: number | null;
}

function offsetMinutes(): number {
  const offset = process.env.CALENDAR_TIMEZONE_OFFSET ?? "+09:00";
  const match = /^([+-])(\d{2}):(\d{2})$/.exec(offset);
  if (!match) return 9 * 60;
  return (match[1] === "-" ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3]));
}

export function parseTimeOfDay(value: string): { hours: number; minutes: number } {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return { hours: 8, minutes: 0 };
  return {
    hours: Math.min(23, Math.max(0, Number(match[1]))),
    minutes: Math.min(59, Math.max(0, Number(match[2]))),
  };
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/**
 * The next occurrence strictly after `after`. For "once" the caller supplies
 * the instant directly, so this handles the recurring kinds.
 */
export function computeNextRun(schedule: Schedule, after: Date = new Date()): Date {
  const offsetMs = offsetMinutes() * 60_000;
  const { hours, minutes } = parseTimeOfDay(schedule.timeOfDay);

  // Local wall-clock as UTC fields.
  const local = new Date(after.getTime() + offsetMs);
  const toUtc = (d: Date) => new Date(d.getTime() - offsetMs);

  const atTime = (year: number, monthIndex: number, day: number) =>
    new Date(Date.UTC(year, monthIndex, day, hours, minutes, 0, 0));

  if (schedule.kind === "daily") {
    let candidate = atTime(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
    if (candidate <= local) candidate = new Date(candidate.getTime() + 86_400_000);
    return toUtc(candidate);
  }

  if (schedule.kind === "weekly") {
    const target = ((schedule.weekday ?? 1) % 7 + 7) % 7;
    let candidate = atTime(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
    let delta = (target - candidate.getUTCDay() + 7) % 7;
    // Same weekday but the time has passed means next week, not in a moment.
    if (delta === 0 && candidate <= local) delta = 7;
    candidate = new Date(candidate.getTime() + delta * 86_400_000);
    return toUtc(candidate);
  }

  if (schedule.kind === "monthly") {
    const wanted = Math.min(31, Math.max(1, schedule.dayOfMonth ?? 1));
    let year = local.getUTCFullYear();
    let month = local.getUTCMonth();

    // Clamping matters: the 31st has to mean "the last day" in a short month
    // rather than rolling into the next one.
    let candidate = atTime(year, month, Math.min(wanted, daysInMonth(year, month)));
    if (candidate <= local) {
      month += 1;
      if (month > 11) {
        month = 0;
        year += 1;
      }
      candidate = atTime(year, month, Math.min(wanted, daysInMonth(year, month)));
    }
    return toUtc(candidate);
  }

  // "once" with no explicit instant: as soon as the dispatcher next runs.
  return after;
}

export function describeSchedule(schedule: Schedule): string {
  const time = schedule.timeOfDay;
  switch (schedule.kind) {
    case "daily":
      return `毎日 ${time}`;
    case "weekly": {
      const names = ["日", "月", "火", "水", "木", "金", "土"];
      return `毎週${names[((schedule.weekday ?? 1) % 7 + 7) % 7]}曜 ${time}`;
    }
    case "monthly":
      return `毎月${schedule.dayOfMonth ?? 1}日 ${time}`;
    default:
      return "一回のみ";
  }
}
