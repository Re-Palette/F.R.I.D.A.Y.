import { NextRequest } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import { conversations, messages } from "@/lib/db/schema";
import { runMainAgentTurn } from "@/lib/agents/main-agent";
import type { LLMMessage } from "@/lib/llm/types";

/**
 * There was a fake typewriter here — the finished answer replayed six
 * characters at a time with a 12ms pause between them. On a typical reply
 * that spent half a second of real waiting to imitate an effect the answer
 * was already past: the Agent Loop resolves to complete text, so nothing
 * was actually being generated during the pauses. Spoken replies paid it
 * twice over, since nothing could be read aloud until the replay finished.
 */

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

  // The opening message is what the conversation is about, so it names it —
  // derived here rather than asked of a model, which would be a whole extra
  // call to label something the user already wrote.
  const title = conversation.title
    ? undefined
    : content.trim().replace(/\s+/g, " ").slice(0, 60) || undefined;

  // Both of these are round trips to Neon, and the user is waiting through
  // every one of them before the model is even asked. Touching the
  // conversation doesn't affect which messages come back, so it need not be
  // waited for first — and the title and timestamp are one write, not two.
  const [history] = await Promise.all([
    db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(asc(messages.createdAt)),
    db
      .update(conversations)
      .set({ updatedAt: new Date(), ...(title ? { title } : {}) })
      .where(eq(conversations.id, conversationId)),
  ]);

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
        // resolves to a complete answer rather than a token stream. Sent the
        // moment it exists.
        fullText = await runMainAgentTurn(user.id, conversationId, llmHistory);
        controller.enqueue(encoder.encode(fullText));
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
