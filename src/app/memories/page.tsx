import { desc, eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import { memories } from "@/lib/db/schema";
import { Panel } from "@/components/ui/Panel";
import { PageHeader } from "@/components/ui/PageHeader";
import { ForgetButton } from "@/components/ForgetButton";

export const dynamic = "force-dynamic";

const TYPE_LABELS: Record<string, string> = {
  fact: "事実",
  preference: "好み",
  decision: "決定",
  summary: "要約",
  entity: "人・案件",
};

/**
 * What F.R.I.D.A.Y. is carrying between conversations.
 *
 * This is the one thing it knows about you that you never explicitly typed
 * anywhere — some of it it decided to keep mid-conversation, the rest was
 * pulled out of a day's transcript overnight. Being able to read that, and
 * strike out what is wrong, is the difference between a memory and a rumour.
 */
export default async function MemoriesPage() {
  const user = await getCurrentUser();
  const rows = await db
    .select()
    .from(memories)
    .where(eq(memories.userId, user.id))
    .orderBy(desc(memories.importance), desc(memories.createdAt));

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 py-10">
      <PageHeader label="記憶" />

      {rows.length === 0 ? (
        <p className="text-[11px] text-[var(--hud-text-dim)]">
          まだ何も記憶していません。会話の中で覚えておくべきことが出てくると、ここに溜まります。
        </p>
      ) : (
        <>
          <p className="mb-4 text-[10px] tracking-[var(--tracking-wide)] text-[var(--hud-orange-dim)]">
            {rows.length}件 — 重要度の高い順
          </p>
          <div className="space-y-3">
            {rows.map((memory) => (
              <Panel key={memory.id} className="px-5 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm text-fg">{memory.content}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 text-[10px] tracking-[var(--tracking-wide)] text-[var(--hud-orange-dim)]">
                      <span>{TYPE_LABELS[memory.type] ?? memory.type}</span>
                      <span>重要度 {memory.importance}</span>
                      <span>{new Date(memory.createdAt).toLocaleDateString("ja-JP")}</span>
                      {memory.sourceRef && <span className="truncate">{memory.sourceRef}</span>}
                    </p>
                  </div>
                  <ForgetButton id={memory.id} />
                </div>
              </Panel>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
