import { and, asc, eq, lte } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { conversations, messages, scheduledTasks } from "@/lib/db/schema";
import { runMainAgentTurn } from "./main-agent";
import { computeNextRun } from "./schedule";

/**
 * Runs whatever has come due.
 *
 * Deliberately "everything overdue" rather than "everything due right now":
 * the dispatcher's cadence is then a quality-of-service knob, not a
 * correctness one. A coarser cron — or one that misses a firing — delays a
 * task instead of dropping it.
 */

// The function has a wall-clock limit and each task is a full agent turn, so
// a backlog is worked through over several firings rather than all at once.
const MAX_PER_RUN = 5;

export interface DispatchResult {
  ran: number;
  failed: number;
}

export async function runDueTasks(): Promise<DispatchResult> {
  const due = await db
    .select()
    .from(scheduledTasks)
    .where(and(eq(scheduledTasks.status, "active"), lte(scheduledTasks.nextRunAt, new Date())))
    .orderBy(asc(scheduledTasks.nextRunAt))
    .limit(MAX_PER_RUN);

  let ran = 0;
  let failed = 0;

  for (const task of due) {
    // Claim before running. Two overlapping dispatches would otherwise both
    // pick up the same row, and a task that acts on the world twice is worse
    // than one that waits for its next turn.
    const rescheduled =
      task.kind === "once"
        ? null
        : computeNextRun(
            {
              kind: task.kind,
              timeOfDay: task.timeOfDay,
              weekday: task.weekday,
              dayOfMonth: task.dayOfMonth,
            },
            new Date()
          );

    await db
      .update(scheduledTasks)
      .set({
        lastRunAt: new Date(),
        ...(rescheduled ? { nextRunAt: rescheduled } : { status: "done" as const }),
      })
      .where(eq(scheduledTasks.id, task.id));

    try {
      const [conversation] = await db
        .insert(conversations)
        .values({
          userId: task.userId,
          title: `予定タスク: ${task.prompt.slice(0, 50)}`,
        })
        .returning();

      await db.insert(messages).values({
        conversationId: conversation.id,
        role: "user",
        content: task.prompt,
      });

      const answer = await runMainAgentTurn(task.userId, conversation.id, [
        { role: "user", content: task.prompt },
      ]);

      await db.insert(messages).values({
        conversationId: conversation.id,
        role: "assistant",
        content: answer,
      });

      await db.update(scheduledTasks).set({ lastError: null }).where(eq(scheduledTasks.id, task.id));
      ran++;
    } catch (err) {
      // A recurring task keeps its schedule: one bad morning shouldn't end it
      // silently. A one-off has nothing left to try, so it is marked failed.
      console.error(`Scheduled task ${task.id} failed:`, err);
      await db
        .update(scheduledTasks)
        .set({
          lastError: err instanceof Error ? err.message : String(err),
          ...(task.kind === "once" ? { status: "failed" as const } : {}),
        })
        .where(eq(scheduledTasks.id, task.id));
      failed++;
    }
  }

  return { ran, failed };
}
