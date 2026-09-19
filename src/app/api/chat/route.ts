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

  // The opening message is what the conversation is about, so it names it —
  // derived here rather than asked of a model, which would be a whole extra
  // call to label something the user already wrote.
  const title = conversation.title
    ? undefined
    : content.trim().replace(/\s+/g, " ").slice(0, 60) || undefined;

  // Every one of these is a round trip to Neon that the user sits through
  // before the model is even asked, so they go together. Storing the new
  // message used to be waited for first, only so the history query could
  // read it back — but its text is already here. It is filtered out of the
  // history by the id the insert returns and appended locally, which is
  // correct however the two queries interleave.
  const [rows, inserted] = await Promise.all([
    db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(asc(messages.createdAt)),
    db
      .insert(messages)
      .values({ conversationId, role: "user", content })
      .returning({ id: messages.id }),
    db
      .update(conversations)
      .set({ updatedAt: new Date(), ...(title ? { title } : {}) })
      .where(eq(conversations.id, conversationId)),
  ]);

  const justInserted = new Set(inserted.map((row) => row.id));
  const llmHistory: LLMMessage[] = [
    ...rows
      .filter((m) => !justInserted.has(m.id))
      .map((m) => ({
        role: (m.role === "tool" ? "assistant" : m.role) as LLMMessage["role"],
        content: m.content,
      })),
    { role: "user", content },
  ];

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let fullText = "";
      try {
        // Sent as the model writes it. The client reads it a sentence at a
        // time and starts reading each one aloud while the rest is still
        // being generated, so the wait before any sound is one sentence
        // rather than the whole answer.
        let streamed = "";
        const onText = (text: string) => {
          streamed += text;
          controller.enqueue(encoder.encode(text));
        };

        const result = await runMainAgentTurn(user.id, conversationId, llmHistory, onText);

        // Deterministic fast paths answer without a model and never stream,
        // and the loop substitutes its own text for a refusal or a limit —
        // so whatever hasn't already gone out still has to.
        const remainder = result && !streamed.endsWith(result) ? result : "";
        if (remainder) controller.enqueue(encoder.encode(remainder));

        // What gets stored is what was actually sent, so reopening the
        // conversation shows the same words that were spoken.
        fullText = streamed + remainder;
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
