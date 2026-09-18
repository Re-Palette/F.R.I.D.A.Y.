import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { scheduledTasks } from "@/lib/db/schema";
import { computeNextRun, describeSchedule, type ScheduleKind } from "../schedule";
import type { ToolDefinition } from "./types";

const KINDS: ScheduleKind[] = ["once", "daily", "weekly", "monthly"];

export const scheduledTasksTool: ToolDefinition = {
  name: "scheduled_tasks",
  description:
    "Arrange for work to happen later, without the user present: either on a repeating schedule " +
    "('毎週月曜に今週の予定をまとめて') or once in the background ('これ調べておいて' — kind='once'). " +
    "The result arrives as a new conversation the user finds when they next open FRIDAY, so say that " +
    "rather than implying you will answer now. Also lists and cancels what is already scheduled.",
  inputSchema: {
    type: "object",
    properties: {
      action: { type: "string", enum: ["create", "list", "cancel"] },
      prompt: {
        type: "string",
        description:
          "create: the instruction to carry out when it runs, written to stand alone — it is executed " +
          "with no conversation around it.",
      },
      kind: {
        type: "string",
        enum: KINDS,
        description: "once = run one time in the background; daily/weekly/monthly = repeating.",
      },
      timeOfDay: { type: "string", description: "'HH:MM' local time. Default 08:00. Ignored for 'once'." },
      weekday: { type: "number", description: "weekly only. 0=Sunday … 1=Monday." },
      dayOfMonth: { type: "number", description: "monthly only, 1–31. Short months use their last day." },
      id: { type: "string", description: "cancel only: the task id from list." },
    },
    required: ["action"],
  },
  level: 1,
  async execute(input, ctx) {
    const action = String(input.action ?? "");

    try {
      if (action === "list") {
        const rows = await db
          .select()
          .from(scheduledTasks)
          .where(and(eq(scheduledTasks.userId, ctx.userId), eq(scheduledTasks.status, "active")))
          .orderBy(asc(scheduledTasks.nextRunAt));
        if (!rows.length) return { ok: true, content: "予定されているタスクはありません。" };
        return {
          ok: true,
          content: rows
            .map(
              (t) =>
                `- id=${t.id}\n  ${describeSchedule({ kind: t.kind, timeOfDay: t.timeOfDay, weekday: t.weekday, dayOfMonth: t.dayOfMonth })}\n  内容: ${t.prompt}\n  次回: ${t.nextRunAt.toISOString()}`
            )
            .join("\n"),
        };
      }

      if (action === "cancel") {
        const id = String(input.id ?? "").trim();
        if (!id) return { ok: false, content: "id is required to cancel" };
        const updated = await db
          .update(scheduledTasks)
          .set({ status: "cancelled" })
          .where(and(eq(scheduledTasks.id, id), eq(scheduledTasks.userId, ctx.userId)))
          .returning({ id: scheduledTasks.id });
        return updated.length
          ? { ok: true, content: "予定タスクを取り消しました。" }
          : { ok: false, content: "そのidの予定タスクは見つかりませんでした。" };
      }

      if (action !== "create") return { ok: false, content: `Unknown action: ${action}` };

      const prompt = String(input.prompt ?? "").trim();
      if (!prompt) return { ok: false, content: "prompt is required" };
      const kind = KINDS.includes(input.kind as ScheduleKind) ? (input.kind as ScheduleKind) : "once";
      const timeOfDay = typeof input.timeOfDay === "string" ? input.timeOfDay : "08:00";
      const weekday = typeof input.weekday === "number" ? Math.round(input.weekday) : null;
      const dayOfMonth = typeof input.dayOfMonth === "number" ? Math.round(input.dayOfMonth) : null;

      const schedule = { kind, timeOfDay, weekday, dayOfMonth };
      // A one-off runs at the next dispatch rather than at a wall-clock time:
      // "look into this" means soon, not at eight tomorrow.
      const nextRunAt = kind === "once" ? new Date() : computeNextRun(schedule);

      const [created] = await db
        .insert(scheduledTasks)
        .values({ userId: ctx.userId, prompt, kind, timeOfDay, weekday, dayOfMonth, nextRunAt })
        .returning();

      return {
        ok: true,
        content:
          kind === "once"
            ? `バックグラウンドで実行するよう登録しました（id ${created.id}）。完了すると新しい会話として結果が残ります。まだ実行していないので「やりました」とは言わないこと。`
            : `${describeSchedule(schedule)} に実行するよう登録しました（id ${created.id}）。次回は ${nextRunAt.toISOString()} です。`,
      };
    } catch (err) {
      return { ok: false, content: `予定タスクの操作に失敗しました: ${(err as Error).message}` };
    }
  },
};
