import { pgTable, uuid, timestamp, index } from "drizzle-orm/pg-core";

/**
 * One row per failed passcode attempt, counted over a sliding window to rate
 * limit /api/unlock.
 *
 * Serverless functions share no memory, so an in-process counter would reset
 * on every cold start and be bypassed entirely by parallel invocations —
 * the database is the only place a limit can actually hold. FRIDAY has a
 * single user, so the limit is global rather than per-IP: nobody legitimate
 * is inconvenienced, and rotating IP addresses buys an attacker nothing.
 *
 * Nothing identifying is stored — the timestamp is the whole point.
 */
export const unlockAttempts = pgTable(
  "unlock_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("unlock_attempts_created_at_idx").on(table.createdAt)]
);
