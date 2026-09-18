import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import { documents, sources } from "@/lib/db/schema";
import { Panel } from "@/components/ui/Panel";
import { PageHeader } from "@/components/ui/PageHeader";

export const dynamic = "force-dynamic";

export default async function DocumentPage({ params }: PageProps<"/documents/[id]">) {
  const { id } = await params;
  const user = await getCurrentUser();

  const [doc] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, id), eq(documents.userId, user.id)))
    .limit(1);
  if (!doc) notFound();

  // Anything the Research Agent actually fetched while this was written —
  // the citations existed all along with nowhere to show them.
  const citations = await db
    .select()
    .from(sources)
    .where(eq(sources.documentId, doc.id))
    .orderBy(asc(sources.retrievedAt));

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 py-10">
      <PageHeader label="資料" backHref="/documents" backLabel="一覧" />

      <h1 className="text-lg text-fg">{doc.title}</h1>
      <p className="mt-1 text-[10px] tracking-[var(--tracking-wide)] text-fg-faint">
        {new Date(doc.createdAt).toLocaleString("ja-JP")}
      </p>

      {doc.storageRef && (
        <a
          href={doc.storageRef}
          target="_blank"
          rel="noreferrer"
          className="mt-3 text-[11px] text-accent hover:underline"
        >
          Notion で開く
        </a>
      )}

      <Panel className="mt-6 px-5 py-4">
        <div className="whitespace-pre-wrap text-sm leading-relaxed text-fg">
          {doc.content ?? "(本文がありません)"}
        </div>
      </Panel>

      {citations.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 text-[10px] tracking-[var(--tracking-wider)] text-fg-muted">出典</h2>
          <ul className="space-y-1">
            {citations.map((s) => (
              <li key={s.id} className="text-[11px]">
                <a href={s.url} target="_blank" rel="noreferrer" className="text-fg-muted hover:text-fg">
                  {s.title || s.url}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
