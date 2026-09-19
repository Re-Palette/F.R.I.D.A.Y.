"use client";

import { HudPanel } from "./HudPanel";

interface ResultPanelProps {
  /** What was heard, kept above the answer for context. */
  heard?: string;
  /** The answer, as it arrives. */
  reply?: string;
  error?: string | null;
  /** Reads out what the system is doing, in the panel's tag slot. */
  state: string;
  busy?: boolean;
}

/**
 * Where an answer appears.
 *
 * It is the same text that is being spoken, arriving as it is written — the
 * panel runs slightly ahead of the voice, which is what watching someone
 * answer looks like. Real output only: nothing here is ever filled with a
 * sample.
 */
export function ResultPanel({ heard, reply, error, state, busy }: ResultPanelProps) {
  const empty = !heard && !reply && !error;

  return (
    <HudPanel
      title="RESPONSE"
      tag={
        <span className="flex items-center gap-1.5 font-[family-name:var(--font-hud)] text-[9px] tracking-[0.18em]">
          <span
            className={`h-[5px] w-[5px] rounded-full ${
              busy ? "hud-pulse bg-[var(--hud-orange-bright)]" : "bg-[var(--hud-orange-dim)]"
            }`}
          />
          {state}
        </span>
      }
      bodyClassName="relative overflow-hidden"
      glow={busy}
    >
      {/* A line travelling down the panel while a turn is in progress. */}
      {busy && (
        <span className="hud-scan pointer-events-none absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-transparent via-[rgba(255,122,26,0.12)] to-transparent"
          style={{ "--hud-duration": "4.5s" } as React.CSSProperties} />
      )}

      <div className="max-h-[20vh] min-h-[3.25rem] overflow-y-auto px-4 py-3">
        {empty ? (
          <p className="text-[11px] leading-relaxed text-[var(--hud-orange-dim)]">
            待機中 — リングに触れるか、下の欄に入力してください。
            「ありがとうフライデー」で終了します。
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {heard && (
              <p className="font-[family-name:var(--font-mono)] text-[11px] text-[var(--hud-orange-dim)]">
                &gt; {heard}
              </p>
            )}
            {reply && (
              <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--hud-text)] sm:text-[14px]">
                {reply}
              </p>
            )}
            {error && <p className="text-[11px] text-[var(--hud-orange)]">{error}</p>}
          </div>
        )}
      </div>
    </HudPanel>
  );
}
