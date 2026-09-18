import { pgTable, uuid, text, timestamp, real } from "drizzle-orm/pg-core";
import { projects, users } from "./core";

export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
  type: text("type", {
    enum: ["report", "email", "sns_post", "slide", "script", "note", "other"],
  }).notNull(),
  title: text("title").notNull(),
  content: text("content"),
  storageRef: text("storage_ref"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sources = pgTable("sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentId: uuid("document_id").references(() => documents.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  title: text("title"),
  publisher: text("publisher"),
  retrievedAt: timestamp("retrieved_at", { withTimezone: true }).notNull().defaultNow(),
  trustScore: real("trust_score"),
});
