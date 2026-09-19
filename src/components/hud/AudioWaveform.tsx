"use client";

import type { CSSProperties } from "react";
import { cn } from "@/lib/cn";

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
 * It moves when the conversation does: still while nothing is happening,
 * running while F.R.I.D.A.Y. is listening or speaking. A waveform that
 * animates through silence is claiming to hear something.
 */
export function AudioWaveform({ active, className }: { active?: boolean; className?: string }) {
  return (
    <div className={cn("flex h-10 items-center gap-[3px]", className)} aria-hidden>
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
