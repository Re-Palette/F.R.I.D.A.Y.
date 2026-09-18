"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { StatusRing } from "@/components/ui/StatusRing";
import { HeroBackdrop } from "@/components/ui/HeroBackdrop";
import { LabelList } from "@/components/ui/LabelList";
import { ChatInputLine } from "@/components/ui/ChatInputLine";
import { cn } from "@/lib/cn";
import { useVoiceConversation, type VoicePhase } from "@/lib/voice-conversation";

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

const TAGLINE = "PERSONAL INTELLIGENCE OPERATING SYSTEM";

const PHASE_LINE: Record<VoicePhase, string> = {
  idle: "リングに触れて話しかける",
  listening: "聞いています",
  thinking: "考えています",
  speaking: "応答中",
};

export function HomeHero() {
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const voice = useVoiceConversation();

  const talking = voice.phase !== "idle";

  // The typed path is the fallback for browsers with no speech recognition —
  // an inert ring would leave them with nothing at all. It still works the way
  // it always did: start a conversation and hand the message to it.
  async function handleSubmit(value: string, options?: { viaVoice?: boolean }) {
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
      // Carried across the navigation so a question asked out loud here is
      // still answered out loud on the screen that actually sends it.
      if (options?.viaVoice) sessionStorage.setItem(`friday:pending-voice:${id}`, "1");
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
        <HeroBackdrop />

        <div className="hidden absolute left-0 top-1/2 z-10 -translate-y-1/2 sm:block">
          <LabelList items={LEFT_STATUS} />
        </div>

        {/* Width is set here, not inherited: as a flex child sized by its
            content the ring collapsed to the width of the line beneath it. */}
        <div className="relative flex w-[min(58vw,21rem)] items-center justify-center">
          <StatusRing size={336} active />

          {/* The ring is the control: the whole instrument is what you touch
              to start talking, so the button covers it rather than sitting
              somewhere beside it. Laid over the ring instead of wrapping it
              because a heading is not phrasing content and cannot live
              inside a button. */}
          {voice.supported && (
            <button
              type="button"
              onClick={voice.toggle}
              aria-label={talking ? "会話を終える" : "話しかける"}
              aria-pressed={talking}
              className="absolute inset-0 z-10 rounded-full outline-none focus-visible:ring-1 focus-visible:ring-accent-dim"
            />
          )}

          {/* Only the mark goes inside, sized so it spans the inner face the
              way the reference does rather than spilling over the band. */}
          <h1
            className={cn(
              "pointer-events-none absolute text-[11px] font-light tracking-[0.22em] transition-colors sm:text-base sm:tracking-[0.32em]",
              talking
                ? "text-accent [text-shadow:0_0_20px_rgba(255,122,26,0.65)]"
                : "[text-shadow:0_0_16px_rgba(255,122,26,0.45)]"
            )}
          >
            F.R.I.D.A.Y.
          </h1>

          {/* Absolute so the ring stays centred on the frame's crosshair
              instead of being pushed up by this line. The tagline and the
              state of the conversation share the slot: same place, same
              size, so nothing moves when one replaces the other. */}
          <p
            className={cn(
              "absolute top-full mt-4 w-max text-center text-[9px] tracking-[var(--tracking-wide)] transition-colors sm:text-[11px]",
              talking ? "text-accent-soft" : "text-fg-muted"
            )}
          >
            {voice.supported ? PHASE_LINE[voice.phase] : TAGLINE}
          </p>
        </div>

        <div className="hidden absolute right-0 top-1/2 z-10 -translate-y-1/2 sm:block">
          <LabelList items={RIGHT_CAPABILITIES} align="right" />
        </div>
      </div>

      {/* Where the input used to be: what was said and what was answered,
          as subtitles. Fixed height so the ring above never moves as lines
          appear and go. */}
      <div className="mx-auto w-full max-w-xl pb-2">
        {voice.supported ? (
          <div className="flex min-h-[5.5rem] flex-col items-center gap-2 overflow-y-auto text-center">
            {voice.heard && (
              <p className="text-[11px] leading-relaxed text-fg-faint">{voice.heard}</p>
            )}
            {voice.reply && (
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-fg sm:text-base">
                {voice.reply}
              </p>
            )}
            {voice.error && <p className="text-[11px] text-fg-muted">{voice.error}</p>}
          </div>
        ) : (
          <>
            <ChatInputLine
              onSubmit={handleSubmit}
              disabled={starting}
              placeholder={starting ? "起動中…" : "何を手伝いましょうか？"}
            />
            {error && <p className="mt-3 text-center text-[11px] text-fg-muted">{error}</p>}
          </>
        )}
      </div>

      {/* Five links plus the version will not sit on one line on a phone;
          stacking beats the columns of single characters that resulted. */}
      <footer className="flex flex-col items-center gap-2 pt-4 text-[10px] text-fg-faint sm:flex-row sm:items-center sm:justify-between">
        <span>F.R.I.D.A.Y. / v1.0.0</span>
        <nav className="flex flex-wrap justify-center gap-x-4 gap-y-1 tracking-[var(--tracking-wider)]">
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
