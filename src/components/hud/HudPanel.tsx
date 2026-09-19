import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/cn";

interface HudPanelProps {
  title?: string;
  /** Small right-aligned marking in the title bar — a code, a count, a state. */
  tag?: ReactNode;
  children?: ReactNode;
  className?: string;
  bodyClassName?: string;
  /** Depth of the cut at the two opposite corners. */
  cut?: number;
  glow?: boolean;
}

/**
 * The surface everything in the HUD is drawn on.
 *
 * Two opposite corners are cut rather than rounded, which is most of what
 * separates instrumentation from a card. The cut is a clip rather than a
 * border, so the diagonal is a real edge — which is why this is two layers
 * one pixel apart: the outer one is the hairline, the inner one is the
 * fill, and the line follows the diagonal instead of stopping at it.
 */
export function HudPanel({
  title,
  tag,
  children,
  className,
  bodyClassName,
  cut = 10,
  glow,
}: HudPanelProps) {
  return (
    <div
      className={cn(
        "hud-cut bg-[var(--hud-line)] p-px",
        glow ? "shadow-[var(--hud-glow-strong)]" : "shadow-[0_0_14px_rgba(255,122,26,0.14)]",
        className
      )}
      style={{ "--cut": `${cut}px` } as CSSProperties}
    >
      <div
        className="hud-cut flex h-full w-full flex-col bg-[var(--hud-panel)] backdrop-blur-[2px]"
        style={{ "--cut": `${cut - 1}px` } as CSSProperties}
      >
        {title && (
          <div className="flex items-center justify-between gap-2 border-b border-[var(--hud-line)] px-3 py-1.5">
            <span className="font-[family-name:var(--font-hud)] text-[10px] tracking-[0.2em] text-[var(--hud-orange)]">
              {title}
            </span>
            {/* The hatched marking from the reference: present on every panel,
                meaning nothing in particular, which is what makes it read as
                a manufactured object rather than a layout. */}
            <span className="flex items-center gap-[3px] text-[var(--hud-orange-dim)]">
              {tag ?? (
                <>
                  <Hatch />
                  <Hatch />
                  <Hatch />
                  <Hatch />
                </>
              )}
            </span>
          </div>
        )}
        <div className={cn("flex-1", bodyClassName)}>{children}</div>
      </div>
    </div>
  );
}

function Hatch() {
  return <span className="block h-[7px] w-[2px] skew-x-[-20deg] bg-current opacity-70" />;
}

/**
 * Four L-brackets around whatever it wraps — the reference's way of saying
 * "this is the thing being looked at". Purely decorative, so it takes no
 * space and never intercepts a click.
 */
export function CornerBrackets({ size = 26, inset = 0 }: { size?: number; inset?: number }) {
  const corners = [
    "left-0 top-0 border-l border-t",
    "right-0 top-0 border-r border-t",
    "left-0 bottom-0 border-l border-b",
    "right-0 bottom-0 border-r border-b",
  ];
  return (
    <div className="pointer-events-none absolute inset-0" style={{ margin: -inset }} aria-hidden>
      {corners.map((position) => (
        <span
          key={position}
          className={cn("absolute border-[var(--hud-line-strong)]", position)}
          style={{ width: size, height: size }}
        />
      ))}
    </div>
  );
}

/**
 * The frame around the whole display: brackets at the four corners and a
 * run of ticks down each side. None of it means anything, which is the
 * point — it is the bezel of the instrument the rest is mounted in, and
 * without it the panels read as boxes floating on a web page.
 */
export function ScreenFrame() {
  return (
    <div className="pointer-events-none absolute inset-3 z-40 sm:inset-4" aria-hidden>
      {[
        "left-0 top-0 border-l-2 border-t-2",
        "right-0 top-0 border-r-2 border-t-2",
        "left-0 bottom-0 border-l-2 border-b-2",
        "right-0 bottom-0 border-r-2 border-b-2",
      ].map((position) => (
        <span
          key={position}
          className={cn("absolute h-6 w-6 border-[var(--hud-orange)] opacity-60", position)}
        />
      ))}

      {["left-0", "right-0"].map((side) => (
        <div
          key={side}
          className={cn("absolute top-1/2 flex -translate-y-1/2 flex-col gap-[6px]", side)}
        >
          {Array.from({ length: 13 }, (_, i) => (
            <span
              key={i}
              className="h-px bg-[var(--hud-orange)]"
              style={{ width: i % 4 === 0 ? 11 : 5, opacity: i % 4 === 0 ? 0.5 : 0.28 }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
