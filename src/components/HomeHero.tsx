"use client";

import Link from "next/link";
import { AgentRoster } from "@/components/hud/AgentRoster";
import { AudioWaveform } from "@/components/hud/AudioWaveform";
import { CommandInput } from "@/components/hud/CommandInput";
import { FridayCore } from "@/components/hud/FridayCore";
import { CornerBrackets, ScreenFrame } from "@/components/hud/HudPanel";
import { HudHeader } from "@/components/hud/HudHeader";
import { RadarPanel } from "@/components/hud/RadarPanel";
import { ResultPanel } from "@/components/hud/ResultPanel";
import { SystemMetrics } from "@/components/hud/SystemMetrics";
import { SystemStatus } from "@/components/hud/SystemStatus";
import { WeatherPanel } from "@/components/hud/WeatherPanel";
import { cn } from "@/lib/cn";
import { useVoiceConversation, type VoicePhase } from "@/lib/voice-conversation";

/** What the ring is doing, in the app's own language, under the core. */
const PHASE_LINE: Record<VoicePhase, string> = {
  idle: "リングに触れて話しかける",
  listening: "聞いています",
  thinking: "考えています",
  speaking: "応答中（話しかければ中断します）",
};

const WAITING_LINE = "「フライデー」と呼んでください";

/** The same state as a HUD marking, for the response panel's header. */
const PHASE_TAG: Record<VoicePhase, string> = {
  idle: "STANDBY",
  listening: "LISTENING",
  thinking: "PROCESSING",
  speaking: "SPEAKING",
};

const SMALL_SCREEN_LINKS = [
  { href: "/chat", label: "会話履歴" },
  { href: "/documents", label: "資料" },
  { href: "/memories", label: "記憶" },
  { href: "/plans", label: "計画" },
  { href: "/tasks", label: "予定タスク" },
  { href: "/approvals", label: "承認待ち" },
];

/**
 * The command screen.
 *
 * Instrumentation around a core, rather than a page with a hero on it: the
 * side columns are always-on readouts, the middle is the thing you talk to,
 * and the rail across the bottom is what you type into when talking isn't
 * an option. Nothing about how a conversation works changed — the ring is
 * still the control, the wake word still starts one, speaking over a reply
 * still takes the turn back.
 *
 * Laid out in absolute regions rather than a document flow because the core
 * has to stay centred in the space left between the header and the command
 * rail whatever the screen is; below lg the columns drop away and what is
 * left stacks.
 */
export function HomeHero() {
  const voice = useVoiceConversation();
  const talking = voice.phase !== "idle";
  const busy = voice.phase === "thinking" || voice.phase === "speaking";

  return (
    <div className="relative flex h-dvh w-full flex-col overflow-hidden bg-[var(--hud-bg)]">
      {/* Background: a technical grid, a warm bloom behind the core, and a
          vignette so the corners stay dark enough for the panels to sit on. */}
      <div className="hud-grid pointer-events-none absolute inset-0 opacity-45" aria-hidden />
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden
        style={{
          background:
            "radial-gradient(ellipse 34% 34% at 50% 44%, rgba(255,122,26,0.07), transparent 72%), radial-gradient(ellipse 90% 80% at 50% 50%, transparent 30%, rgba(0,0,0,0.9) 100%)",
        }}
      />

      <ScreenFrame />

      <HudHeader
        wakeSupported={voice.supported}
        wakeEnabled={voice.wakeEnabled}
        onToggleWake={() => voice.setWakeEnabled(!voice.wakeEnabled)}
      />

      {/* --- Left column --- */}
      <div className="absolute left-6 top-[7.25rem] z-20 hidden w-[17.5rem] flex-col gap-4 lg:flex">
        <SystemMetrics />
        <RadarPanel />
        <SystemStatus />
      </div>

      {/* --- Right column --- */}
      <div className="absolute right-6 top-[7.25rem] z-20 hidden w-[17.5rem] flex-col gap-4 lg:flex">
        <WeatherPanel />
        <AgentRoster />
      </div>

      {/* --- Core --- */}
      <div className="absolute inset-x-0 top-[4.5rem] bottom-[11.25rem] z-10 flex flex-col items-center justify-center gap-4">
        <div className="relative aspect-square w-[min(62vh,90vw,38rem)]">
          <CornerBrackets size={34} inset={-26} />

          {/* The ring is the control: the whole instrument is what you touch
              to start talking. The button is laid over it rather than
              wrapping it, so the core stays a picture and this stays a
              control with its own label. */}
          {voice.supported && (
            <button
              type="button"
              onClick={voice.toggle}
              aria-label={talking ? "会話を終える" : "話しかける"}
              aria-pressed={talking}
              className="absolute inset-[12%] z-10 rounded-full outline-none focus-visible:ring-1 focus-visible:ring-[var(--hud-orange)]"
            />
          )}

          <FridayCore live={talking} />
        </div>

        <p
          className={cn(
            "px-4 text-center text-[10px] tracking-[var(--tracking-wide)] transition-colors sm:text-[11px]",
            talking ? "text-[var(--hud-orange-bright)]" : "text-[var(--hud-text-dim)]"
          )}
        >
          {!voice.supported
            ? "PERSONAL INTELLIGENCE OPERATING SYSTEM"
            : voice.waiting
              ? WAITING_LINE
              : PHASE_LINE[voice.phase]}
        </p>
      </div>

      {/* --- Bottom: what came back, then the way in --- */}
      <div className="absolute inset-x-0 bottom-0 z-20 flex flex-col gap-2 px-4 pb-4 sm:px-6 sm:pb-5">
        <div className="mx-auto flex w-full max-w-5xl items-end justify-between gap-4">
          <div className="min-w-0 flex-1">
            <ResultPanel
              heard={voice.heard}
              reply={voice.reply}
              error={voice.error}
              state={voice.waiting && !talking ? "WAKE" : PHASE_TAG[voice.phase]}
              busy={busy}
            />
          </div>
          <AudioWaveform active={talking} className="hidden shrink-0 sm:flex" />
        </div>

        <div className="mx-auto w-full max-w-5xl">
          <CommandInput
            onSubmit={voice.send}
            disabled={busy}
            listening={voice.phase === "listening"}
            transcript={voice.heard}
            micSupported={voice.supported}
            onMic={voice.toggle}
          />
        </div>

        {/* The roster is a column on a wide screen; on a narrow one it comes
            back as a strip, because navigation that only exists at 1024px is
            navigation that doesn't exist. */}
        <nav className="mx-auto flex w-full max-w-5xl flex-wrap justify-center gap-x-4 gap-y-1 pt-1 lg:hidden">
          {SMALL_SCREEN_LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="font-[family-name:var(--font-hud)] text-[9px] tracking-[0.18em] text-[var(--hud-orange-dim)] hover:text-[var(--hud-orange)]"
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
