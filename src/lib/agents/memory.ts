import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { memories } from "@/lib/db/schema";

/**
 * Long-term memory across conversations.
 *
 * Retrieval is deliberately not semantic yet. Anthropic has no embeddings
 * endpoint, so vector search would mean a second paid provider and a second
 * key — against the "Anthropic only, cheap by default" decision this app is
 * built on. At one user's scale the whole store is a few dozen short facts,
 * which fits in the system prompt outright, so ranking by importance and
 * recency and handing the model all of it beats any retrieval algorithm and
 * costs no extra call. The `memories.embedding` column and its HNSW index
 * stay unused, ready for the swap if the store ever outgrows the prompt —
 * only recallMemories() would change.
 */

export const MEMORY_TYPES = ["fact", "preference", "decision", "summary", "entity"] as const;
export type MemoryType = (typeof MEMORY_TYPES)[number];

const RECALL_LIMIT = 40;

export async function recallMemories(userId: string) {
  return db
    .select()
    .from(memories)
    .where(eq(memories.userId, userId))
    .orderBy(desc(memories.importance), desc(memories.createdAt))
    .limit(RECALL_LIMIT);
}

export async function rememberFact(params: {
  userId: string;
  type: MemoryType;
  content: string;
  importance: number;
  sourceRef?: string;
}): Promise<"saved" | "duplicate"> {
  // The model has no view of what it already stored, so without this the
  // same fact accumulates a row per conversation that mentions it.
  const [existing] = await db
    .select({ id: memories.id })
    .from(memories)
    .where(and(eq(memories.userId, params.userId), eq(memories.content, params.content)))
    .limit(1);
  if (existing) return "duplicate";

  await db.insert(memories).values({
    userId: params.userId,
    type: params.type,
    content: params.content,
    importance: params.importance,
    sourceRef: params.sourceRef,
  });
  return "saved";
}

export function formatMemoriesForPrompt(rows: Awaited<ReturnType<typeof recallMemories>>): string {
  if (!rows.length) return "";
  const lines = rows.map((m) => `- [${m.type}] ${m.content}`).join("\n");
  return `\n\nこれまでの会話で記憶したユーザーについての情報:\n${lines}\n（この情報は既知のものとして自然に使ってください。わざわざ「記憶によると」等と前置きしないこと。事実が古い・誤っていると分かった場合は remember で新しい内容を保存してください。）`;
}
