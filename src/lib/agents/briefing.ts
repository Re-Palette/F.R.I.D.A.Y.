import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { conversations, messages } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { routeModel } from "@/lib/llm/router";
import {
  formatEventLine,
  isGoogleCalendarConfigured,
  listEvents,
  localDateRangeToUtc,
  localDateString,
} from "@/lib/integrations/google-calendar";
import { isGmailConfigured, searchEmails } from "@/lib/integrations/gmail";

/**
 * The daily brief — the first thing FRIDAY does without being asked.
 *
 * The facts are gathered in code, not by an agent loop deciding which tools
 * to call: what goes in a morning brief is known in advance, so spending
 * model turns rediscovering it every day would be pure cost. One cheap call
 * turns those facts into something worth reading, and if it fails the raw
 * list is delivered anyway — a brief that is plainer than intended still
 * beats no brief.
 */

const WRITE_SYSTEM_PROMPT = `あなたは F.R.I.D.A.Y. です。以下の実データだけを使って、今日の朝のブリーフィングを書いてください。
- 事実を足さない。与えられたデータに無いことは書かない。
- 箇条書き中心で簡潔に。前置きや挨拶の定型文は不要。
- 予定とメールから、今日気をつけるべきことが1つあれば最後に一言添える。無ければ書かない。`;

interface BriefFacts {
  date: string;
  sections: string[];
}

async function gatherFacts(): Promise<BriefFacts> {
  const date = localDateString(0);
  const sections: string[] = [];

  if (isGoogleCalendarConfigured()) {
    try {
      const { timeMin, timeMax } = localDateRangeToUtc(date);
      const events = await listEvents(timeMin, timeMax);
      sections.push(
        events.length
          ? `今日の予定 (${events.length}件):\n${events.map(formatEventLine).join("\n")}`
          : "今日の予定: なし"
      );
    } catch (err) {
      // One broken integration shouldn't cost the whole brief.
      console.error("Briefing: calendar lookup failed:", err);
      sections.push("今日の予定: 取得できませんでした");
    }
  }

  if (isGmailConfigured()) {
    try {
      const unread = await searchEmails("is:unread newer_than:2d", 10);
      sections.push(
        unread.length
          ? `未読メール (${unread.length}件):\n${unread.map((m) => `- ${m.from} / ${m.subject}`).join("\n")}`
          : "未読メール: なし"
      );
    } catch (err) {
      console.error("Briefing: unread mail lookup failed:", err);
      sections.push("未読メール: 取得できませんでした");
    }
  }

  return { date, sections };
}

async function write(facts: BriefFacts): Promise<string> {
  const raw = facts.sections.join("\n\n");
  const { provider, model } = routeModel("summarization");

  try {
    const result = await provider.complete({
      model,
      system: WRITE_SYSTEM_PROMPT,
      messages: [{ role: "user", content: `日付: ${facts.date}\n\n${raw}` }],
      maxTokens: 1024,
    });
    const text = result.content
      .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    return text || raw;
  } catch (err) {
    console.error("Briefing: write-up failed, delivering the raw facts:", err);
    return raw;
  }
}

export interface BriefingResult {
  status: "created" | "skipped" | "nothing_connected";
  conversationId?: string;
}

export async function runDailyBriefing(): Promise<BriefingResult> {
  const user = await getCurrentUser();
  const facts = await gatherFacts();

  if (!facts.sections.length) return { status: "nothing_connected" };

  const title = `朝のブリーフィング ${facts.date}`;

  // Cron can fire more than once for the same day — a retry, a manual run —
  // and two identical briefs would be worse than none.
  const [existing] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(and(eq(conversations.userId, user.id), eq(conversations.title, title)))
    .limit(1);
  if (existing) return { status: "skipped", conversationId: existing.id };

  const content = await write(facts);

  const [conversation] = await db
    .insert(conversations)
    .values({ userId: user.id, title })
    .returning();
  await db.insert(messages).values({
    conversationId: conversation.id,
    role: "assistant",
    content,
  });

  return { status: "created", conversationId: conversation.id };
}
