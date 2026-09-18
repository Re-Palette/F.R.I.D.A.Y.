import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import { documents } from "@/lib/db/schema";
import { Panel } from "@/components/ui/Panel";
import { PageHeader } from "@/components/ui/PageHeader";

export const dynamic = "force-dynamic";

const TYPE_LABELS: Record<string, string> = {
  report: "レポート",
  email: "メール",
  sns_post: "SNS投稿",
  slide: "スライド",
  script: "台本",
  note: "メモ",
  other: "その他",
};

export default async function DocumentsPage() {
  const user = await getCurrentUser();
  const rows = await db
    .select({
      id: documents.id,
      type: documents.type,
      title: documents.title,
      storageRef: documents.storageRef,
      createdAt: documents.createdAt,
    })
    .from(documents)
    .where(eq(documents.userId, user.id))
    .orderBy(desc(documents.createdAt))
    .limit(100);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 py-10">
      <PageHeader label="作成した資料" />

      {rows.length === 0 ? (
        <p className="text-[11px] text-fg-muted">まだ資料はありません。</p>
      ) : (
        <div className="space-y-2">
          {rows.map((d) => (
            <Link key={d.id} href={`/documents/${d.id}`} className="block">
              <Panel className="px-5 py-4 transition-colors hover:border-border-strong">
                <p className="truncate text-sm text-fg">{d.title}</p>
                <p className="mt-1 text-[10px] tracking-[var(--tracking-wide)] text-fg-faint">
                  {TYPE_LABELS[d.type] ?? d.type}
                  {d.storageRef ? " / Notion に公開済み" : ""}
                  {" / "}
                  {new Date(d.createdAt).toLocaleString("ja-JP")}
                </p>
              </Panel>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
