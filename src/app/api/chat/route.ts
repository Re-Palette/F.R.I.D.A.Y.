import { NextRequest } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import { conversations, messages } from "@/lib/db/schema";
import { runMainAgentTurn } from "@/lib/agents/main-agent";
import type { LLMMessage } from "@/lib/llm/types";

// Chunk size/delay for the fake-typewriter effect below.
const CHUNK_CHARS = 6;
const CHUNK_DELAY_MS = 12;

export async function POST(req: NextRequest) {
  try {
    return await handleChat(req);
  } catch (err) {
    // Everything above the stream — reading the body, loading the user,
    // the history queries — used to throw straight out of the handler,
    // which Next turns into a 500 with an empty body. The client then reads
    // a response with nothing in it and shows nothing at all. The detail
    // belongs in the server log, not in a response this deployment serves
    // without a login.
    console.error("Chat request failed before streaming:", err);
    return new Response("リクエストを処理できませんでした。", { status: 500 });
  }
}

async function handleChat(req: NextRequest) {
  const user = await getCurrentUser();

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

  const stream = new ReadableStream({
    async start(controller) {
      let fullText = "";
      try {
        // The Agent Loop may call tools across several model turns, so it
        // resolves to a complete answer rather than a token stream (see
        // OpenAIProvider.stream()'s tool limitation). We replay it to the
        // client in small chunks to keep the existing typewriter UX.
        fullText = await runMainAgentTurn(user.id, conversationId, llmHistory);
        for (let i = 0; i < fullText.length; i += CHUNK_CHARS) {
          controller.enqueue(encoder.encode(fullText.slice(i, i + CHUNK_CHARS)));
          if (CHUNK_DELAY_MS) await new Promise((r) => setTimeout(r, CHUNK_DELAY_MS));
        }
      } catch (err) {
        // Without this, a thrown error here just closes the stream with
        // nothing ever enqueued — the client reads a clean "done" with an
        // empty body and shows nothing at all, not even an error. Surface
        // something over the stream instead of failing silently, and don't
        // persist it as a real assistant turn.
        console.error("Agent turn failed:", err);
        controller.enqueue(encoder.encode("（エラーが発生しました。もう一度お試しください）"));
      } finally {
        if (fullText) {
          await db.insert(messages).values({ conversationId, role: "assistant", content: fullText });
        }
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
