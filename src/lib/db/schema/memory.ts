import { pgTable, uuid, text, timestamp, integer, vector, index } from "drizzle-orm/pg-core";
import { users } from "./core";

export const MEMORY_EMBEDDING_DIMENSIONS = 1536;

export const memories = pgTable(
  "memories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    type: text("type", {
      enum: ["fact", "preference", "decision", "summary", "entity"],
    }).notNull(),
    content: text("content").notNull(),
    embedding: vector("embedding", { dimensions: MEMORY_EMBEDDING_DIMENSIONS }),
    sourceRef: text("source_ref"),
    importance: integer("importance").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("memories_embedding_idx").using("hnsw", table.embedding.op("vector_cosine_ops"))]
);
