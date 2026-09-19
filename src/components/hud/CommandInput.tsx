"use client";

import { useState, type FormEvent } from "react";
import { cn } from "@/lib/cn";

interface CommandInputProps {
  onSubmit: (value: string) => void;
  disabled?: boolean;
  /** Shown in place of what has been typed while the microphone is open. */
  transcript?: string;
  listening?: boolean;
  micSupported?: boolean;
  onMic?: () => void;
}

/**
 * The command rail across the bottom.
 *
 * This screen is voice-first — the ring is the control and a whole
 * conversation can be held without touching anything. The rail is the other
 * way in: for a browser with no speech recognition, for a room where
 * talking out loud isn't an option, and for anything easier typed than
 * said. Either way the turn goes through the same pipeline and the answer
 * is spoken and shown in the same place.
 */
export function CommandInput({
  onSubmit,
  disabled,
  transcript,
  listening,
  micSupported,
  onMic,
}: CommandInputProps) {
  const [value, setValue] = useState("");

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSubmit(trimmed);
    setValue("");
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full items-stretch gap-2 sm:gap-3">
      {micSupported && (
        <button
          type="button"
          onClick={onMic}
          aria-label={listening ? "音声入力を停止" : "音声で話しかける"}
          aria-pressed={listening}
          className={cn(
            "hud-cut flex w-12 shrink-0 items-center justify-center bg-[var(--hud-line)] p-px transition-colors sm:w-14",
            listening && "bg-[var(--hud-orange)]"
          )}
          style={{ "--cut": "8px" } as React.CSSProperties}
        >
          <span
            className={cn(
              "hud-cut flex h-full w-full items-center justify-center bg-[var(--hud-panel-solid)] transition-colors",
              listening ? "text-[var(--hud-orange-bright)]" : "text-[var(--hud-orange-dim)]"
            )}
            style={{ "--cut": "7px" } as React.CSSProperties}
          >
            {/* The reference's signal glyph rather than a microphone pictogram:
                what this button means is "listen", and the waveform says it. */}
            <span className="flex items-end gap-[2px]" aria-hidden>
              {[7, 13, 18, 11, 6].map((height, i) => (
                <span
                  key={i}
                  className={cn("w-[2px] rounded-full bg-current", listening && "hud-wave")}
                  style={
                    {
                      height,
                      "--hud-duration": `${0.7 + i * 0.13}s`,
                      "--hud-delay": `${i * 0.08}s`,
                    } as React.CSSProperties
                  }
                />
              ))}
            </span>
          </span>
        </button>
      )}

      <div
        className={cn(
          "hud-cut flex flex-1 items-center bg-[var(--hud-line)] p-px transition-colors",
          listening && "bg-[var(--hud-line-strong)]"
        )}
        style={{ "--cut": "8px" } as React.CSSProperties}
      >
        <div
          className="hud-cut flex h-full w-full items-center gap-3 bg-[var(--hud-panel-solid)] px-4 py-3"
          style={{ "--cut": "7px" } as React.CSSProperties}
        >
          <span className="font-[family-name:var(--font-mono)] text-sm text-[var(--hud-orange)]">&gt;</span>
          {/* Never read-only. The microphone reopening between turns must not
              take the keyboard away — showing the live transcript is worth
              doing only while there is nothing typed to show instead. */}
          <input
            value={listening && !value && transcript ? transcript : value}
            onChange={(event) => setValue(event.target.value)}
            disabled={disabled}
            placeholder={listening ? "聞いています…" : "話しかけてください…"}
            aria-label="F.R.I.D.A.Y. への入力"
            className="min-w-0 flex-1 bg-transparent text-sm text-[var(--hud-text)] outline-none placeholder:text-[var(--hud-orange-dim)] disabled:opacity-50"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={disabled || !value.trim()}
        className="hud-cut w-20 shrink-0 bg-[var(--hud-orange)] p-px transition-opacity disabled:opacity-35 sm:w-28"
        style={{ "--cut": "8px" } as React.CSSProperties}
      >
        <span
          className="hud-cut flex h-full w-full items-center justify-center gap-2 bg-[var(--hud-orange)] font-[family-name:var(--font-hud)] text-[10px] tracking-[0.2em] text-[#1a0c02] sm:text-[11px]"
          style={{ "--cut": "7px" } as React.CSSProperties}
        >
          SEND
          <span aria-hidden>▸</span>
        </span>
      </button>
    </form>
  );
}
