"use client";

import type { CSSProperties } from "react";

interface StatusRingProps {
  size?: number;
  active?: boolean;
  label?: string;
}

const VB = 400;
const C = VB / 2;

// Irregular on purpose: evenly spaced ticks read as a loading spinner, while
// uneven runs read as an instrument whose segments mean different things.
const SEGMENTS = "34 6 12 6 54 10 22 6 8 6 40 6 16 10 28 6";
const FINE_TICKS = "1.5 4.5";

type Spin = { duration: string; reverse?: boolean; steps?: number };

/**
 * The instrument the whole interface is built around: measured arcs turning
 * at different rates around a luminous amber band, with the wordmark in the
 * middle of it.
 *
 * Arcs that step round in discrete clicks (`steps`) rather than gliding are
 * what makes this read as machinery instead of a spinner — mixed with a
 * couple of smooth ones so it doesn't become uniformly jerky.
 *
 * Drawn in a fixed 400-unit viewBox and scaled by CSS, so the same component
 * is the hero at 544px and the lock screen's mark at 140; `size` is a
 * maximum, not a fixed width, so narrow screens shrink it.
 */
export function StatusRing({ size = 160, active = true, label }: StatusRingProps) {
  const spin = ({ duration, reverse, steps }: Spin): CSSProperties | undefined =>
    active
      ? ({
          "--ring-duration": duration,
          "--ring-direction": reverse ? "reverse" : "normal",
          ...(steps ? { "--ring-easing": `steps(${steps})` } : {}),
        } as CSSProperties)
      : undefined;

  const cls = (on = true) => (active && on ? "ring-rotate" : undefined);

  return (
    <div
      className="relative inline-flex aspect-square w-full items-center justify-center"
      style={{ maxWidth: size }}
    >
      <svg viewBox={`0 0 ${VB} ${VB}`} className="h-full w-full overflow-visible">
        <defs>
          <filter id="ring-bloom" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="10" />
          </filter>
          <filter id="ring-bloom-tight" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="3" />
          </filter>
          {/* Without this the wedge's straight edges read as a rendering
              artefact rather than a sweep — but kept slight, since at the
              sizes this renders a heavier blur turns it into a grey smudge. */}
          <filter id="ring-sweep-soft" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="3.5" />
          </filter>
          <radialGradient id="ring-core">
            <stop offset="55%" stopColor="#000" stopOpacity="0" />
            <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0.16" />
          </radialGradient>
          {/* The trailing wedge of a radar sweep. */}
          <linearGradient id="ring-sweep" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0" />
            <stop offset="100%" stopColor="var(--color-accent-soft)" stopOpacity="0.5" />
          </linearGradient>
        </defs>

        {/* Outermost: fine ticks, indexing one notch at a time. */}
        <circle
          cx={C} cy={C} r={188}
          fill="none" stroke="var(--color-ring-metal)" strokeWidth={1}
          strokeDasharray={FINE_TICKS} opacity={0.5}
          className={cls()} style={spin({ duration: "120s", steps: 72 })}
        />
        <circle
          cx={C} cy={C} r={172}
          fill="none" stroke="var(--color-ring-metal)" strokeWidth={7}
          strokeDasharray={SEGMENTS} opacity={0.5}
          className={cls()} style={spin({ duration: "90s", reverse: true, steps: 36 })}
        />
        <circle
          cx={C} cy={C} r={158}
          fill="none" stroke="var(--color-accent)" strokeWidth={5}
          strokeDasharray="10 150 26 90" opacity={0.75}
          className={cls()} style={spin({ duration: "28s" })}
        />
        <circle
          cx={C} cy={C} r={146}
          fill="none" stroke="var(--color-ring-metal)" strokeWidth={9}
          strokeDasharray="20 10 46 8 14 12 30 8" opacity={0.6}
          className={cls()} style={spin({ duration: "60s", reverse: true, steps: 24 })}
        />
        <circle
          cx={C} cy={C} r={132}
          fill="none" stroke="var(--color-ring-metal)" strokeWidth={1}
          strokeDasharray={FINE_TICKS} opacity={0.45}
          className={cls()} style={spin({ duration: "45s", steps: 90 })}
        />

        {/* Calipers at the cardinals — fixed, so everything else is visibly
            turning against something that isn't. */}
        <g stroke="var(--color-accent)" strokeWidth={1.5} opacity={0.55} fill="none">
          {[0, 90, 180, 270].map((deg) => (
            <path
              key={deg}
              d={`M ${C - 14} 186 L ${C - 14} 176 L ${C + 14} 176 L ${C + 14} 186`}
              transform={`rotate(${deg} ${C} ${C})`}
            />
          ))}
        </g>

        {/* Readouts that flicker on their own schedule. */}
        {[
          { deg: 34, delay: "0s" },
          { deg: 127, delay: "1.3s" },
          { deg: 212, delay: "2.1s" },
          { deg: 305, delay: "0.7s" },
        ].map(({ deg, delay }) => (
          <rect
            key={deg}
            x={C - 5} y={126} width={10} height={5}
            fill="var(--color-accent)"
            transform={`rotate(${deg} ${C} ${C})`}
            className={active ? "ring-blink" : undefined}
            style={{ "--ring-duration": "3.2s", "--ring-delay": delay } as CSSProperties}
          />
        ))}

        {/* The bright band. Drawn three times: a wide blur for the bloom that
            spills onto everything around it, the band itself, then a pale
            core so the middle of the stroke reads hotter than its edges. */}
        <g>
          <circle
            cx={C} cy={C} r={116}
            fill="none" stroke="var(--color-accent)" strokeWidth={16}
            filter="url(#ring-bloom)" opacity={active ? 0.75 : 0.3}
          />
          <circle cx={C} cy={C} r={116} fill="none" stroke="var(--color-accent)" strokeWidth={9} />
          <circle
            cx={C} cy={C} r={116}
            fill="none" stroke="var(--color-accent-soft)" strokeWidth={3}
            filter="url(#ring-bloom-tight)" opacity={0.9}
          />
          {/* A hot spot riding the band: the one fast, smooth thing here. */}
          <circle
            cx={C} cy={C} r={116}
            fill="none" stroke="#fff" strokeWidth={5} strokeLinecap="round"
            strokeDasharray="3 361" opacity={0.85}
            filter="url(#ring-bloom-tight)"
            className={cls()} style={spin({ duration: "9s" })}
          />
        </g>

        {/* Inner face: dark, with the glow falling off across it. */}
        <circle cx={C} cy={C} r={108} fill="var(--color-void)" />
        <circle cx={C} cy={C} r={108} fill="url(#ring-core)" />

        {/* Radar sweep across the face, under the wordmark. */}
        <g className={cls()} style={spin({ duration: "6s" })}>
          <path
            d={`M ${C} ${C} L ${C + 104} ${C - 34} A 108 108 0 0 1 ${C + 104} ${C + 34} Z`}
            fill="url(#ring-sweep)"
            filter="url(#ring-sweep-soft)"
            opacity={0.14}
          />
        </g>

        <circle
          cx={C} cy={C} r={100}
          fill="none" stroke="var(--color-accent-dim)" strokeWidth={1} opacity={0.5}
        />
        <circle
          cx={C} cy={C} r={92}
          fill="none" stroke="var(--color-ring-metal)" strokeWidth={1}
          strokeDasharray="2 10" opacity={0.6}
          className={cls()} style={spin({ duration: "30s", reverse: true, steps: 30 })}
        />

        {/* Where the frame's crosshair meets the outermost arc. Drawn here so
            they land exactly on the ring at whatever size it renders. */}
        {[-1, 1].map((dir) => (
          <path
            key={dir}
            d={`M ${C + dir * 196} ${C - 7} L ${C + dir * 203} ${C} L ${C + dir * 196} ${C + 7} L ${C + dir * 189} ${C} Z`}
            fill="var(--color-accent)"
            opacity={0.8}
          />
        ))}
      </svg>

      {label && (
        <span className="absolute text-[9px] uppercase tracking-[var(--tracking-wide)] text-fg-muted">
          {label}
        </span>
      )}
    </div>
  );
}
