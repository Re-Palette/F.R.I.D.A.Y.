"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { StatusRing } from "@/components/ui/StatusRing";
import { LabelList } from "@/components/ui/LabelList";
import { ChatInputLine } from "@/components/ui/ChatInputLine";

const LEFT_STATUS = [
  { label: "Analyzing", active: false },
  { label: "Collecting", active: false },
  { label: "Learning", active: true },
];

const RIGHT_CAPABILITIES = [
  { label: "Search", active: true },
  { label: "Research", active: true },
  { label: "Create", active: true },
  { label: "Support", active: true },
];

export function HomeHero() {
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(value: string) {
    setStarting(true);
    setError(null);
    try {
      const res = await fetch("/api/conversations", { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error || `HTTP ${res.status}`);
      }
      const { id } = (await res.json()) as { id: string };
      sessionStorage.setItem(`friday:pending:${id}`, value);
      router.push(`/chat/${id}`);
    } catch (err) {
      // Silently resetting here meant a failed start looked identical to
      // nothing happening: the input just became editable again.
      console.error("Failed to start a conversation:", err);
      setError("起動に失敗しました。もう一度お試しください。");
      setStarting(false);
    }
  }

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden px-8 py-6 sm:px-14 sm:py-8">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-full border border-border-strong text-[11px] text-accent">
            F
          </span>
          <span className="text-xs tracking-[var(--tracking-wider)]">F.R.I.D.A.Y.</span>
        </div>
        <nav className="hidden gap-3 text-[10px] tracking-[var(--tracking-wider)] text-fg-muted sm:flex">
          <span>THINK</span>
          <span className="text-fg-faint">/</span>
          <span>CONNECT</span>
          <span className="text-fg-faint">/</span>
          <span>EXECUTE</span>
        </nav>
      </header>

      <div className="relative flex flex-1 items-center justify-center">
        <div className="hidden absolute left-0 top-1/2 -translate-y-1/2 sm:block">
          <LabelList items={LEFT_STATUS} />
        </div>

        <div className="flex flex-col items-center gap-6 text-center">
          <StatusRing size={220} active />
          <div className="flex flex-col items-center gap-3">
            <h1 className="text-3xl font-light tracking-[var(--tracking-wider)] sm:text-4xl">
              F.R.I.D.A.Y.
            </h1>
            <p className="text-[11px] tracking-[var(--tracking-wide)] text-fg-muted">
              PERSONAL INTELLIGENCE OPERATING SYSTEM
            </p>
          </div>
        </div>

        <div className="hidden absolute right-0 top-1/2 -translate-y-1/2 sm:block">
          <LabelList items={RIGHT_CAPABILITIES} align="right" />
        </div>
      </div>

      <div className="mx-auto w-full max-w-xl pb-2">
        <ChatInputLine
          onSubmit={handleSubmit}
          disabled={starting}
          placeholder={starting ? "起動中…" : "何を手伝いましょうか？"}
        />
        {error && (
          <p className="mt-3 text-center text-[11px] text-fg-muted">{error}</p>
        )}
      </div>

      <footer className="flex items-center justify-between pt-4 text-[10px] text-fg-faint">
        <span>F.R.I.D.A.Y. / v1.0.0</span>
        <nav className="flex gap-4 tracking-[var(--tracking-wider)]">
          <Link href="/chat" className="hover:text-fg-muted">
            会話履歴
          </Link>
          <Link href="/documents" className="hover:text-fg-muted">
            資料
          </Link>
          <Link href="/plans" className="hover:text-fg-muted">
            計画
          </Link>
          <Link href="/tasks" className="hover:text-fg-muted">
            予定タスク
          </Link>
          <Link href="/approvals" className="hover:text-fg-muted">
            承認待ち
          </Link>
        </nav>
      </footer>
    </div>
  );
}
