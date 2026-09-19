import { and, asc, eq, gte, lt } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import { conversations, documents, messages } from "@/lib/db/schema";
import { createNotionPage, isNotionConfigured } from "@/lib/integrations/notion";
import { localDateRangeToUtc, localDateString } from "@/lib/integrations/google-calendar";
import { routeModel } from "@/lib/llm/router";
import { MEMORY_TYPES, rememberFact, type MemoryType } from "./memory";

/**
 * Nothing said gets lost.
 *
 * Every message was already being stored — that has never been the gap. The
 * gap was that a transcript is not a memory: it sits in a row nobody reads,
 * and what carries into the next conversation depends on the model having
 * decided, mid-turn, to call `remember`. Which it does unevenly, because it
 * is busy answering.
 *
 * So once a day the whole day is read back: written up as a report, and
 * mined for the handful of things worth keeping. `remember` still fires in
 * the moment for anything obvious; this is the pass that catches the rest,
 * at one cheap call a day rather than one per turn.
 */

const SYSTEM_PROMPT = `あなたは F.R.I.D.A.Y. です。以下は昨日ユーザーと交わした会話の全文です。
これを読んで、2つのセクションだけを出力してください。他の文章は書かないこと。

## レポート
その日何を話し、何を決め、何が宙に浮いたままかを、後から読んで思い出せるように簡潔にまとめる。
事実だけを書き、会話に無いことを足さない。話題ごとに短い見出しを付けてよい。

## 記憶
今日以降も役に立つ情報だけを、1行1件で抜き出す。形式は厳密に:
- [種類|重要度] 内容
種類は fact / preference / decision / entity のいずれか。重要度は1〜5の整数（5が最重要）。
「明日の会議」のようなその場限りの予定は書かない。ユーザーの好み、繰り返し出てくる人や案件、
決まったこと、長く変わらない事実だけを書く。該当が無ければこのセクションは空のままでよい。`;

export interface ExtractedMemory {
  type: MemoryType;
  content: string;
  importance: number;
}

export interface ParsedDigest {
  report: string;
  memories: ExtractedMemory[];
}

const MEMORY_HEADING = /^##\s*記憶\s*$/m;
const REPORT_HEADING = /^##\s*レポート\s*$/m;
const MEMORY_LINE = /^[-*]\s*\[\s*([^\]|]+?)\s*\|\s*(\d+)\s*\]\s*(.+)$/;
/** A line that got the format nearly right — the type but not the weight. */
const LOOSE_MEMORY_LINE = /^[-*]\s*\[\s*([^\]]+?)\s*\]\s*(.+)$/;

function asMemoryType(raw: string): MemoryType {
  const found = MEMORY_TYPES.find((type) => type === raw.trim().toLowerCase());
  // An unrecognised label is still a fact about the user; dropping the line
  // over its tag would lose the thing worth keeping.
  return found ?? "fact";
}

/**
 * Splits the model's answer into the report and the facts.
 *
 * Written to salvage rather than reject: a model that wanders off the
 * format still produced a day's worth of thinking, and losing all of it
 * because a bracket is missing would be the wrong trade. Pure, so the
 * salvaging is pinned down by tests.
 */
export function parseDigest(text: string): ParsedDigest {
  const trimmed = text.trim();
  const at = trimmed.search(MEMORY_HEADING);

  const reportPart = at === -1 ? trimmed : trimmed.slice(0, at);
  const memoryPart = at === -1 ? "" : trimmed.slice(at).replace(MEMORY_HEADING, "");

  const report = reportPart.replace(REPORT_HEADING, "").trim();

  const memories: ExtractedMemory[] = [];
  for (const line of memoryPart.split("\n")) {
    const strict = MEMORY_LINE.exec(line.trim());
    if (strict) {
      const content = strict[3].trim();
      if (content) {
        memories.push({
          type: asMemoryType(strict[1]),
          content,
          importance: Math.min(5, Math.max(1, Number(strict[2]) || 2)),
        });
      }
      continue;
    }
    const loose = LOOSE_MEMORY_LINE.exec(line.trim());
    if (loose) {
      const content = loose[2].trim();
      if (content) memories.push({ type: asMemoryType(loose[1]), content, importance: 2 });
    }
  }

  return { report, memories };
}

/** One line of transcript, as the model will read it. */
function transcriptLine(role: string, content: string): string {
  const who = role === "user" ? "ユーザー" : "F.R.I.D.A.Y.";
  return `${who}: ${content}`;
}

/**
 * A day is not usually long, but one runaway research answer could be. The
 * cap is on the transcript rather than the number of messages so that a
 * quiet day with one enormous reply still gets most of its conversation in.
 */
const MAX_TRANSCRIPT = 24_000;

export function buildTranscript(
  rows: Array<{ title: string | null; role: string; content: string }>
): string {
  const byConversation = new Map<string, string[]>();
  for (const row of rows) {
    const key = row.title ?? "（無題）";
    const lines = byConversation.get(key) ?? [];
    lines.push(transcriptLine(row.role, row.content));
    byConversation.set(key, lines);
  }

  const whole = [...byConversation.entries()]
    .map(([title, lines]) => `### ${title}\n${lines.join("\n")}`)
    .join("\n\n");

  // Kept from the end: the later part of a day is what the next one follows on from.
  return whole.length > MAX_TRANSCRIPT ? `…（前略）\n${whole.slice(-MAX_TRANSCRIPT)}` : whole;
}

export interface DigestResult {
  status: "created" | "skipped" | "nothing_said" | "failed";
  date: string;
  remembered?: number;
  storedAt?: string;
}

export async function runDailyDigest(): Promise<DigestResult> {
  // The day that just ended, not the one starting: this runs in the morning.
  const date = localDateString(-1);
  const title = `会話ログ ${date}`;

  try {
    const user = await getCurrentUser();

    // A cron can fire twice for the same day — a retry, a manual run — and a
    // second digest would double every memory it extracted.
    const [existing] = await db
      .select({ id: documents.id })
      .from(documents)
      .where(and(eq(documents.userId, user.id), eq(documents.title, title)))
      .limit(1);
    if (existing) return { status: "skipped", date };

    const { timeMin, timeMax } = localDateRangeToUtc(date);
    const rows = await db
      .select({ title: conversations.title, role: messages.role, content: messages.content })
      .from(messages)
      .innerJoin(conversations, eq(messages.conversationId, conversations.id))
      .where(
        and(
          eq(conversations.userId, user.id),
          gte(messages.createdAt, new Date(timeMin)),
          lt(messages.createdAt, new Date(timeMax))
        )
      )
      .orderBy(asc(messages.createdAt));

    if (!rows.length) return { status: "nothing_said", date };

    const transcript = buildTranscript(rows);
    const { provider, model } = routeModel("summarization");
    const result = await provider.complete({
      model,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: `日付: ${date}\n\n${transcript}` }],
      maxTokens: 2048,
    });

    const raw = result.content
      .filter((block): block is Extract<typeof block, { type: "text" }> => block.type === "text")
      .map((block) => block.text)
      .join("");
    const { report, memories } = parseDigest(raw);

    // A day that produced no write-up is not worth a page, but its facts are
    // still worth keeping.
    const body = report || transcript;

    let storageRef: string | undefined;
    if (isNotionConfigured()) {
      try {
        const page = await createNotionPage(title, body);
        storageRef = page.url ?? undefined;
      } catch (err) {
        // Notion being down is not a reason to lose the day.
        console.error("Digest: Notion publish failed, keeping it locally:", err);
      }
    }

    await db.insert(documents).values({
      userId: user.id,
      type: "report",
      title,
      content: body,
      storageRef,
    });

    let remembered = 0;
    for (const memory of memories) {
      const outcome = await rememberFact({
        userId: user.id,
        type: memory.type,
        content: memory.content,
        importance: memory.importance,
        sourceRef: title,
      });
      if (outcome === "saved") remembered++;
    }

    return { status: "created", date, remembered, storedAt: storageRef ?? "FRIDAY" };
  } catch (err) {
    console.error("Daily digest failed:", err);
    return { status: "failed", date };
  }
}
