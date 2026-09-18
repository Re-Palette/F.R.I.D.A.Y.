import { pgTable, uuid, text, timestamp, integer, index } from "drizzle-orm/pg-core";
import { users } from "./core";

/**
 * Work FRIDAY does without being present for the asking — both a recurring
 * task ("毎週月曜に今週の予定をまとめて") and a one-off deferred one
 * ("これ調べておいて"). They are the same row: a deferred task is simply a
 * schedule that happens once.
 *
 * The schedule is stored as its parts rather than a cron expression. A cron
 * string is easy for the model to get subtly wrong and impossible for the
 * user to check at a glance, and nothing here needs more than "every day at
 * 7", "every Monday", "the 1st of the month".
 */
export const scheduledTasks = pgTable(
  "scheduled_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    /** What to do, in the user's own words — run through the Agent Loop when due. */
    prompt: text("prompt").notNull(),
    kind: text("kind", { enum: ["once", "daily", "weekly", "monthly"] }).notNull(),
    /** "HH:MM" in the configured local offset. */
    timeOfDay: text("time_of_day").notNull().default("08:00"),
    /** 0 = Sunday. Weekly only. */
    weekday: integer("weekday"),
    /** Monthly only; clamped to the last day of shorter months. */
    dayOfMonth: integer("day_of_month"),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }).notNull(),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    status: text("status", { enum: ["active", "done", "cancelled", "failed"] })
      .notNull()
      .default("active"),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("scheduled_tasks_due_idx").on(table.status, table.nextRunAt)]
);
