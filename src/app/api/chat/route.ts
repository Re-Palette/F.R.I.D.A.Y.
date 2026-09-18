import { NextRequest } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import { conversations, messages } from "@/lib/db/schema";
import { runMainAgentTurn } from "@/lib/agents/main-agent";
import type { LLMMessage } from "@/lib/llm/types";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return new Response("unauthorized", { status: 401 });

  const { conversationId, content } = (await req.json()) as {
    conversationId: string;
    content: string;
  };

  const [conversation] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.userId, user.id)))
    .limit(1);
  if (!conversation) return new Response("not found", { status: 404 });

  await db.insert(messages).values({ conversationId, role: "user", content });

  const history = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.createdAt));

  const llmHistory: LLMMessage[] = history.map((m) => ({
    role: m.role === "tool" ? "assistant" : m.role,
    content: m.content,
  }));

  const encoder = new TextEncoder();
  let fullText = "";

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of runMainAgentTurn(llmHistory)) {
          if (chunk.type === "text") {
            fullText += chunk.text;
            controller.enqueue(encoder.encode(chunk.text));
          }
        }
      } finally {
        if (fullText) {
          await db.insert(messages).values({
            conversationId,
            role: "assistant",
            content: fullText,
          });
        }
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
