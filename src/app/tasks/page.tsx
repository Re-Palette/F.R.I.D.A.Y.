import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import { scheduledTasks } from "@/lib/db/schema";
import { describeSchedule } from "@/lib/agents/schedule";
import { Panel } from "@/components/ui/Panel";
import { CancelTaskButton } from "@/components/CancelTaskButton";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  const user = await getCurrentUser();
  const rows = await db
    .select()
    .from(scheduledTasks)
    .where(and(eq(scheduledTasks.userId, user.id), eq(scheduledTasks.status, "active")))
    .orderBy(asc(scheduledTasks.nextRunAt));

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 py-10">
      <header className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-6 w-6 items-center justify-center rounded-full border border-border-strong text-[10px] text-accent">
            F
          </span>
          <span className="text-[10px] tracking-[var(--tracking-wider)] text-fg-muted">予定タスク</span>
        </div>
        <Link href="/" className="text-[10px] tracking-[var(--tracking-wider)] text-fg-muted hover:text-fg">
          HOME
        </Link>
      </header>

      {rows.length === 0 ? (
        <p className="text-[11px] text-fg-muted">予定されているタスクはありません。</p>
      ) : (
        <div className="space-y-4">
          {rows.map((t) => (
            <Panel key={t.id} className="px-5 py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm text-fg">{t.prompt}</p>
                  <p className="mt-1 text-[10px] tracking-[var(--tracking-wide)] text-fg-faint">
                    {describeSchedule({
                      kind: t.kind,
                      timeOfDay: t.timeOfDay,
                      weekday: t.weekday,
                      dayOfMonth: t.dayOfMonth,
                    })}
                    {" / 次回 "}
                    {new Date(t.nextRunAt).toLocaleString("ja-JP")}
                  </p>
                  {t.lastError && (
                    <p className="mt-1 text-[10px] text-fg-muted">前回の失敗: {t.lastError}</p>
                  )}
                </div>
                <CancelTaskButton id={t.id} />
              </div>
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}
