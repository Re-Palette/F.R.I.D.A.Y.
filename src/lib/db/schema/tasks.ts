import { pgTable, uuid, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { projects, users } from "./core";

export const tasks = pgTable("tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
  goal: text("goal").notNull(),
  status: text("status", {
    enum: ["pending", "in_progress", "blocked", "done", "cancelled"],
  })
    .notNull()
    .default("pending"),
  priority: text("priority", { enum: ["low", "normal", "high", "urgent"] })
    .notNull()
    .default("normal"),
  deadline: timestamp("deadline", { withTimezone: true }),
  createdByAgent: text("created_by_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const subtasks = pgTable("subtasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  taskId: uuid("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  status: text("status", {
    enum: ["pending", "in_progress", "blocked", "done", "cancelled"],
  })
    .notNull()
    .default("pending"),
  dependsOn: uuid("depends_on").array().notNull().default([]),
  derived: boolean("derived").notNull().default(false),
  assignedAgent: text("assigned_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const events = pgTable("events", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  source: text("source").notNull(),
  externalId: text("external_id"),
  title: text("title").notNull(),
  startAt: timestamp("start_at", { withTimezone: true }).notNull(),
  endAt: timestamp("end_at", { withTimezone: true }),
  syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
});
