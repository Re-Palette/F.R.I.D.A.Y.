import { asc, desc, eq, inArray } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import { subtasks, tasks } from "@/lib/db/schema";
import { Panel } from "@/components/ui/Panel";
import { PageHeader } from "@/components/ui/PageHeader";

export const dynamic = "force-dynamic";

export default async function PlansPage() {
  const user = await getCurrentUser();
  const plans = await db
    .select()
    .from(tasks)
    .where(eq(tasks.userId, user.id))
    .orderBy(desc(tasks.createdAt))
    .limit(50);

  // One query for every plan's steps rather than one per plan.
  const steps = plans.length
    ? await db
        .select()
        .from(subtasks)
        .where(inArray(subtasks.taskId, plans.map((p) => p.id)))
        .orderBy(asc(subtasks.createdAt))
    : [];

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 py-10">
      <PageHeader label="立てた計画" />

      {plans.length === 0 ? (
        <p className="text-[11px] text-fg-muted">まだ計画はありません。</p>
      ) : (
        <div className="space-y-4">
          {plans.map((plan) => (
            <Panel key={plan.id} className="px-5 py-4">
              <p className="text-sm text-fg">{plan.goal}</p>
              <p className="mt-1 text-[10px] tracking-[var(--tracking-wide)] text-fg-faint">
                {plan.status} / 優先度 {plan.priority} /{" "}
                {new Date(plan.createdAt).toLocaleString("ja-JP")}
              </p>
              <ul className="mt-3 space-y-1">
                {steps
                  .filter((s) => s.taskId === plan.id)
                  .map((s) => (
                    <li key={s.id} className="text-[11px] text-fg-muted">
                      - {s.description}
                      {/* The Planning Agent is asked to find work the user
                          didn't ask for but the goal needs; worth marking. */}
                      {s.derived && <span className="ml-1 text-accent-dim">（派生）</span>}
                    </li>
                  ))}
              </ul>
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}
