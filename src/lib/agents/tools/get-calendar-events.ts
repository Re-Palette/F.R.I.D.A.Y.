import {
  formatEventLine,
  isGoogleCalendarConfigured,
  listEvents,
  localDateRangeToUtc,
} from "@/lib/integrations/google-calendar";
import type { ToolDefinition } from "./types";

export const getCalendarEventsTool: ToolDefinition = {
  name: "get_calendar_events",
  description:
    "Read-only lookup of the user's Google Calendar for a date range. Use this whenever the user asks about " +
    "their schedule/plans/availability instead of guessing — never invent calendar data.",
  inputSchema: {
    type: "object",
    properties: {
      startDate: { type: "string", description: "ISO date (YYYY-MM-DD) in the user's local timezone, inclusive." },
      endDate: {
        type: "string",
        description: "ISO date (YYYY-MM-DD), exclusive end. Omit for a single day (startDate only).",
      },
    },
    required: ["startDate"],
  },
  level: 1,
  async execute(input) {
    if (!isGoogleCalendarConfigured()) {
      return { ok: false, content: "Google Calendar is not connected yet. Tell the user this isn't set up." };
    }

    const startDate = String(input.startDate ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return { ok: false, content: "startDate must be YYYY-MM-DD" };
    const endDate = typeof input.endDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input.endDate) ? input.endDate : undefined;

    try {
      const { timeMin, timeMax } = localDateRangeToUtc(startDate, endDate);
      const events = await listEvents(timeMin, timeMax);
      if (!events.length) return { ok: true, content: `No events found for ${startDate}${endDate ? `–${endDate}` : ""}.` };
      return { ok: true, content: events.map(formatEventLine).join("\n") };
    } catch (err) {
      return { ok: false, content: `Calendar lookup failed: ${(err as Error).message}` };
    }
  },
};
