import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import { conversations } from "@/lib/db/schema";
import { Panel } from "@/components/ui/Panel";

export const dynamic = "force-dynamic";

export default async function ConversationsPage() {
  const user = await getCurrentUser();
  const rows = await db
    .select({ id: conversations.id, title: conversations.title, updatedAt: conversations.updatedAt })
    .from(conversations)
    .where(eq(conversations.userId, user.id))
    .orderBy(desc(conversations.updatedAt))
    .limit(100);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 py-10">
      <header className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-6 w-6 items-center justify-center rounded-full border border-border-strong text-[10px] text-accent">
            F
          </span>
          <span className="text-[10px] tracking-[var(--tracking-wider)] text-fg-muted">会話履歴</span>
        </div>
        <Link href="/" className="text-[10px] tracking-[var(--tracking-wider)] text-fg-muted hover:text-fg">
          HOME
        </Link>
      </header>

      {rows.length === 0 ? (
        <p className="text-[11px] text-fg-muted">まだ会話はありません。</p>
      ) : (
        <div className="space-y-2">
          {rows.map((c) => (
            <Link key={c.id} href={`/chat/${c.id}`} className="block">
              <Panel className="px-5 py-4 transition-colors hover:border-border-strong">
                <p className="truncate text-sm text-fg">{c.title ?? "(無題の会話)"}</p>
                <p className="mt-1 text-[10px] tracking-[var(--tracking-wide)] text-fg-faint">
                  {new Date(c.updatedAt).toLocaleString("ja-JP")}
                </p>
              </Panel>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
