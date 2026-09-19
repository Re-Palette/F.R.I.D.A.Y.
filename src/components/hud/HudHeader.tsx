"use client";

import { useHudClock } from "@/lib/hud-clock";
import { cn } from "@/lib/cn";

interface HudHeaderProps {
  wakeSupported: boolean;
  wakeEnabled: boolean;
  onToggleWake: () => void;
}

/**
 * The top rail: who this is on the left, when it is on the right.
 *
 * The wake switch lives up here with the clock rather than somewhere in the
 * body, because whether the microphone is open is a fact about the system,
 * and it should be readable at a glance from across the room.
 */
export function HudHeader({ wakeSupported, wakeEnabled, onToggleWake }: HudHeaderProps) {
  const clock = useHudClock();

  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between px-6 py-4 sm:px-8">
      <div className="pointer-events-auto flex items-center gap-3">
        <span className="relative flex h-8 w-8 items-center justify-center">
          <span className="absolute inset-0 rotate-45 border border-[var(--hud-orange)] shadow-[var(--hud-glow)]" />
          <span className="h-[7px] w-[7px] rounded-full bg-[var(--hud-orange)] shadow-[0_0_8px_rgba(255,122,26,0.9)]" />
        </span>

        <div className="flex flex-col">
          <div className="flex items-end gap-3">
            <h1 className="font-[family-name:var(--font-hud)] text-[15px] font-bold leading-none tracking-[0.12em] text-[var(--hud-orange-bright)] [text-shadow:0_0_14px_rgba(255,122,26,0.55)] sm:text-[19px]">
              F.R.I.D.A.Y.
            </h1>
            <span className="hidden font-[family-name:var(--font-hud)] text-[9px] tracking-[0.24em] text-[var(--hud-text-dim)] sm:inline">
              AI ASSISTANT SYSTEM
            </span>
          </div>
          {/* The rule that runs off to the right and stops in a notch — the
              reference's way of tying a label to the frame it sits in. */}
          <div className="mt-1.5 flex items-center">
            <span className="h-px w-32 bg-[var(--hud-line-strong)] sm:w-64" />
            <span className="h-px w-3 -skew-x-[45deg] bg-[var(--hud-line-strong)]" />
            <span className="ml-1 h-[5px] w-[5px] rotate-45 border border-[var(--hud-orange)]" />
          </div>
        </div>
      </div>

      <div className="pointer-events-auto flex flex-col items-end gap-1.5">
        <div className="flex items-center">
          <span className="mr-1 h-[5px] w-[5px] rotate-45 border border-[var(--hud-orange)]" />
          <span className="h-px w-16 skew-x-[45deg] bg-[var(--hud-line-strong)] sm:w-28" />
        </div>
        <p className="font-[family-name:var(--font-mono)] text-[20px] leading-none tracking-[0.08em] text-[var(--hud-orange-bright)] [text-shadow:0_0_12px_rgba(255,122,26,0.45)] sm:text-[26px]">
          {clock?.time ?? "--:--:--"}
        </p>
        <p className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.12em] text-[var(--hud-text-dim)]">
          {clock?.date ?? "----.--.--"}
        </p>

        {wakeSupported && (
          <button
            type="button"
            onClick={onToggleWake}
            aria-pressed={wakeEnabled}
            className={cn(
              "mt-1 font-[family-name:var(--font-hud)] text-[9px] tracking-[0.2em] transition-colors",
              wakeEnabled
                ? "text-[var(--hud-orange)] [text-shadow:0_0_10px_rgba(255,122,26,0.6)]"
                : "text-[var(--hud-orange-dim)] hover:text-[var(--hud-orange)]"
            )}
          >
            WAKE {wakeEnabled ? "ON" : "OFF"}
          </button>
        )}
      </div>
    </header>
  );
}
