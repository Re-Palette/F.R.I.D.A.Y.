import { pgTable, uuid, text, timestamp, jsonb, integer } from "drizzle-orm/pg-core";
import { users } from "./core";

export const approvals = pgTable("approvals", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  level: integer("level").notNull(), // 2 = confirmation, 3 = explicit
  type: text("type").notNull(),
  payload: jsonb("payload").notNull(),
  status: text("status", {
    enum: ["pending", "approved", "rejected", "edited"],
  })
    .notNull()
    .default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

export const drafts = pgTable("drafts", {
  id: uuid("id").primaryKey().defaultRandom(),
  approvalId: uuid("approval_id")
    .notNull()
    .references(() => approvals.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  content: jsonb("content").notNull(),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const activityLogs = pgTable("activity_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  actor: text("actor", { enum: ["user", "agent"] }).notNull(),
  action: text("action").notNull(),
  target: text("target"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
