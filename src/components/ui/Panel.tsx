import type { CSSProperties, HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  raised?: boolean;
  glow?: boolean;
}

/**
 * Base surface for all chrome.
 *
 * Now cut rather than rounded, so the list screens are built from the same
 * geometry as the HUD they are reached from — see HudPanel, which this is
 * the plain form of. The two layers a pixel apart are what put a hairline
 * along the diagonal; a border alone stops where the clip starts.
 */
export function Panel({ raised, glow, className, style, ...props }: PanelProps) {
  return (
    <div
      className={cn(
        "hud-cut bg-[var(--hud-line)] p-px",
        glow ? "shadow-[var(--hud-glow)]" : "shadow-[0_0_12px_rgba(255,122,26,0.12)]"
      )}
      style={{ "--cut": "8px" } as CSSProperties}
    >
      <div
        className={cn(
          "hud-cut h-full w-full",
          raised ? "bg-[var(--hud-panel-solid)]" : "bg-[var(--hud-panel)]",
          className
        )}
        style={{ "--cut": "7px", ...style } as CSSProperties}
        {...props}
      />
    </div>
  );
}
