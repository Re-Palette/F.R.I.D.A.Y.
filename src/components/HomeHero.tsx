"use client";

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

  async function handleSubmit(value: string) {
    setStarting(true);
    try {
      const res = await fetch("/api/conversations", { method: "POST" });
      if (!res.ok) throw new Error("failed to create conversation");
      const { id } = (await res.json()) as { id: string };
      sessionStorage.setItem(`friday:pending:${id}`, value);
      router.push(`/chat/${id}`);
    } catch {
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
      </div>

      <footer className="flex items-center justify-between pt-4 text-[10px] text-fg-faint">
        <span>F.R.I.D.A.Y. / v1.0.0</span>
        <span />
      </footer>
    </div>
  );
}
