import { pgTable, uuid, text, timestamp, jsonb, integer, numeric } from "drizzle-orm/pg-core";
import { tasks } from "./tasks";
import { users } from "./core";

export const toolConnections = pgTable("tool_connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  accessTokenEncrypted: text("access_token_encrypted"),
  refreshTokenEncrypted: text("refresh_token_encrypted"),
  scopes: text("scopes").array().notNull().default([]),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const agentRuns = pgTable("agent_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
  agentRole: text("agent_role").notNull(),
  status: text("status", {
    enum: ["running", "succeeded", "failed", "timed_out", "cancelled"],
  })
    .notNull()
    .default("running"),
  steps: jsonb("steps").notNull().default([]),
  // Every LLM call this run made — orchestrator turns *and* nested calls
  // inside tools (Planning/Creation) — as {model, inputTokens, outputTokens,
  // costUsd}[]. Backs the cost-monitoring UI (Master Brief §8): today's/this
  // month's usage, and which agent/model spent the most.
  llmCalls: jsonb("llm_calls").notNull().default([]),
  apiCallCount: integer("api_call_count").notNull().default(0),
  tokensUsed: integer("tokens_used").notNull().default(0),
  costUsd: numeric("cost_usd", { precision: 10, scale: 4 }).notNull().default("0"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
});
