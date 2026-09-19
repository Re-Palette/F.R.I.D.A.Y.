"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { cn } from "@/lib/cn";
import { subscribeToInputLevel } from "@/lib/voice-activity";

// Fixed heights and rates: a waveform seeded at random redraws differently
// on the server and the client, which is a hydration mismatch as well as a
// worse-looking waveform.
const BARS = [
  0.30, 0.62, 0.22, 0.86, 0.44, 0.70, 0.33, 0.95, 0.52, 0.28, 0.74, 0.40,
  0.88, 0.35, 0.60, 0.25, 0.80, 0.48, 0.66, 0.30, 0.92, 0.38, 0.56, 0.24,
  0.72, 0.42, 0.84, 0.31, 0.64, 0.27,
];

/**
 * The signal trace in the bottom-right corner.
 *
 * Its height is the microphone, for real — while the interruption watch is
 * running, this is what that watch is hearing. So it is a meter as well as
 * a decoration: if it does not move when you speak over a reply, the reason
 * the reply did not stop is that nothing reached the microphone, which is
 * worth being able to see rather than guess at.
 *
 * The level is written straight to a custom property rather than held in
 * state. It changes sixty times a second, and re-rendering the screen for
 * each frame of a waveform would cost more than the waveform is worth.
 */
export function AudioWaveform({ active, className }: { active?: boolean; className?: string }) {
  const trace = useRef<HTMLDivElement>(null);

  useEffect(
    () =>
      subscribeToInputLevel((level) => {
        // RMS sits well under 1 even when someone is talking straight at it,
        // so it is scaled to fill the trace rather than shown raw.
        trace.current?.style.setProperty("--hud-level", String(Math.min(1, level * 6).toFixed(3)));
      }),
    []
  );

  return (
    <div
      ref={trace}
      className={cn("flex h-10 origin-center items-center gap-[3px] transition-transform duration-100", className)}
      style={{ transform: "scaleY(calc(0.2 + 0.8 * var(--hud-level, 0.3)))" }}
      aria-hidden
    >
      {BARS.map((height, i) => (
        <span
          key={i}
          className={cn(
            "w-[2px] rounded-full bg-[var(--hud-orange)] transition-opacity",
            active ? "hud-wave opacity-90 [filter:drop-shadow(0_0_4px_rgba(255,122,26,0.7))]" : "opacity-25"
          )}
          style={
            {
              height: `${Math.round(height * 100)}%`,
              "--hud-duration": `${0.8 + (i % 5) * 0.16}s`,
              "--hud-delay": `${(i % 7) * 0.09}s`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
