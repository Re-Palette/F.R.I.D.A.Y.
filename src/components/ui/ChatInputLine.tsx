"use client";

import { useState, type FormEvent } from "react";
import { cn } from "@/lib/cn";
import { useSpeechInput } from "@/lib/speech";

interface ChatInputLineProps {
  onSubmit: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

/**
 * The minimal bottom input from the reference design language: an
 * underline field rather than a rounded chat bubble input.
 */
export function ChatInputLine({ onSubmit, disabled, placeholder }: ChatInputLineProps) {
  const [value, setValue] = useState("");

  // Dictation lands in the field rather than sending: a misheard word is
  // trivial to fix before submitting and awkward to take back afterwards.
  const speech = useSpeechInput((text) =>
    setValue((current) => (current ? `${current} ${text}` : text))
  );

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSubmit(trimmed);
    setValue("");
  }

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div
        className={cn(
          "flex items-center gap-3 border-b pb-3 transition-colors",
          speech.listening ? "border-accent" : "border-border-strong focus-within:border-accent-dim"
        )}
      >
        <span className="text-accent text-sm select-none">›</span>
        <input
          value={speech.listening && speech.transcript ? speech.transcript : value}
          onChange={(e) => setValue(e.target.value)}
          disabled={disabled}
          placeholder={
            speech.listening ? "聞いています…" : placeholder ?? "F.R.I.D.A.Y.に話しかける…"
          }
          className="flex-1 bg-transparent text-sm text-fg placeholder:text-fg-faint outline-none disabled:opacity-50"
        />

        {/* Only offered where the browser can actually do it — a microphone
            that does nothing is worse than no microphone. */}
        {speech.supported && (
          <button
            type="button"
            onClick={speech.listening ? speech.stop : speech.start}
            disabled={disabled}
            aria-label={speech.listening ? "音声入力を停止" : "音声で入力"}
            aria-pressed={speech.listening}
            className={cn(
              "shrink-0 rounded-full p-1.5 transition-colors disabled:opacity-40",
              speech.listening
                ? "text-accent [filter:drop-shadow(0_0_6px_rgba(255,122,26,0.7))]"
                : "text-fg-faint hover:text-fg-muted"
            )}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <rect x="9" y="2" width="6" height="12" rx="3" />
              <path d="M5 11a7 7 0 0 0 14 0" strokeLinecap="round" />
              <path d="M12 18v3" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>

      {speech.error && <p className="mt-2 text-[10px] text-fg-muted">{speech.error}</p>}
    </form>
  );
}
