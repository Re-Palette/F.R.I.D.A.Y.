"use client";

import { useState } from "react";
import Link from "next/link";
import { MinimalButton } from "@/components/ui/MinimalButton";
import { Panel } from "@/components/ui/Panel";
import type { PendingApproval } from "@/lib/agents/approvals";

export function ApprovalQueue({ initial }: { initial: PendingApproval[] }) {
  const [items, setItems] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch("/api/approvals");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { approvals } = (await res.json()) as { approvals: PendingApproval[] };
    setItems(approvals);
  }

  async function resolve(id: string, action: "approve" | "reject") {
    setBusy(id);
    setNotice(null);
    try {
      const res = await fetch(`/api/approvals/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const body = (await res.json()) as { error?: string; detail?: string };
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      setNotice(action === "approve" ? `実行しました。${body.detail ?? ""}` : "却下しました。");
      await refresh();
    } catch (err) {
      console.error("Failed to resolve approval:", err);
      setNotice(err instanceof Error ? err.message : "処理できませんでした。");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 py-10">
      <header className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-6 w-6 items-center justify-center rounded-full border border-border-strong text-[10px] text-accent">
            F
          </span>
          <span className="text-[10px] tracking-[var(--tracking-wider)] text-fg-muted">承認待ち</span>
        </div>
        <Link
          href="/"
          className="text-[10px] tracking-[var(--tracking-wider)] text-fg-muted hover:text-fg"
        >
          HOME
        </Link>
      </header>

      {notice && <p className="mb-6 text-[11px] text-fg-muted">{notice}</p>}

      {items.length === 0 && <p className="text-[11px] text-fg-muted">承認待ちの操作はありません。</p>}

      <div className="space-y-4">
        {items.map((item) => (
          <Panel key={item.id} className="px-5 py-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm text-fg">{item.summary}</p>
                <p className="mt-1 text-[10px] tracking-[var(--tracking-wide)] text-fg-faint">
                  {item.tool} / LEVEL {item.level} /{" "}
                  {new Date(item.createdAt).toLocaleString("ja-JP")}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <MinimalButton
                  variant="accent"
                  disabled={busy === item.id}
                  onClick={() => resolve(item.id, "approve")}
                >
                  承認
                </MinimalButton>
                <MinimalButton
                  variant="ghost"
                  disabled={busy === item.id}
                  onClick={() => resolve(item.id, "reject")}
                >
                  却下
                </MinimalButton>
              </div>
            </div>

            <details className="mt-3">
              <summary className="cursor-pointer text-[10px] tracking-[var(--tracking-wide)] text-fg-faint hover:text-fg-muted">
                内容を確認
              </summary>
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words text-[11px] text-fg-muted">
                {JSON.stringify(item.input, null, 2)}
              </pre>
            </details>
          </Panel>
        ))}
      </div>
    </div>
  );
}
