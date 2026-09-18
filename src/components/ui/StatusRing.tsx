"use client";

interface StatusRingProps {
  size?: number;
  active?: boolean;
  label?: string;
}

const VB = 400;
const C = VB / 2;

// Irregular on purpose: evenly spaced ticks read as a loading spinner, while
// uneven runs read as an instrument with segments that mean different things.
const SEGMENTS = "34 6 12 6 54 10 22 6 8 6 40 6 16 10 28 6";
const FINE_TICKS = "1.5 4.5";

/**
 * The instrument ring the whole interface is built around: a luminous amber
 * band inside a set of darker measured arcs, with the wordmark sitting in the
 * middle of it.
 *
 * Everything is drawn in a fixed 400-unit viewBox and scaled by CSS, so the
 * same component is the hero at 440px and the lock screen's mark at 140 —
 * `size` is a maximum, not a fixed width, so narrow screens shrink it rather
 * than overflowing.
 */
export function StatusRing({ size = 160, active = true, label }: StatusRingProps) {
  const spin = (duration: string, reverse = false) =>
    active
      ? {
          animation: `spin ${duration} linear infinite${reverse ? " reverse" : ""}`,
          transformOrigin: "center",
        }
      : undefined;

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
          <radialGradient id="ring-core">
            <stop offset="55%" stopColor="#000" stopOpacity="0" />
            <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0.16" />
          </radialGradient>
        </defs>

        {/* Outermost measured arcs — slow, barely moving. */}
        <circle
          cx={C} cy={C} r={188}
          fill="none" stroke="var(--color-ring-metal)" strokeWidth={1}
          strokeDasharray={FINE_TICKS} opacity={0.5}
          style={spin("240s")}
        />
        <circle
          cx={C} cy={C} r={172}
          fill="none" stroke="var(--color-ring-metal)" strokeWidth={7}
          strokeDasharray={SEGMENTS} opacity={0.5}
          style={spin("180s", true)}
        />
        <circle
          cx={C} cy={C} r={158}
          fill="none" stroke="var(--color-accent)" strokeWidth={5}
          strokeDasharray="10 150 26 90" opacity={0.75}
          style={spin("120s")}
        />
        <circle
          cx={C} cy={C} r={146}
          fill="none" stroke="var(--color-ring-metal)" strokeWidth={9}
          strokeDasharray="20 10 46 8 14 12 30 8" opacity={0.6}
          style={spin("150s", true)}
        />
        <circle
          cx={C} cy={C} r={132}
          fill="none" stroke="var(--color-ring-metal)" strokeWidth={1}
          strokeDasharray={FINE_TICKS} opacity={0.45}
          style={spin("90s")}
        />

        {/* The bright band. Drawn three times: a wide blur for the bloom that
            spills onto everything around it, the band itself, then a pale
            core so the centre of the stroke reads hotter than its edges. */}
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
          {/* Two hot spots riding the band, the only fast-moving thing here. */}
          <circle
            cx={C} cy={C} r={116}
            fill="none" stroke="#fff" strokeWidth={5} strokeLinecap="round"
            strokeDasharray="3 361" opacity={0.85}
            filter="url(#ring-bloom-tight)"
            style={spin("14s")}
          />
        </g>

        {/* Inner face: dark, with the glow falling off across it. */}
        <circle cx={C} cy={C} r={108} fill="var(--color-void)" />
        <circle cx={C} cy={C} r={108} fill="url(#ring-core)" />
        <circle
          cx={C} cy={C} r={100}
          fill="none" stroke="var(--color-accent-dim)" strokeWidth={1} opacity={0.5}
        />
        <circle
          cx={C} cy={C} r={92}
          fill="none" stroke="var(--color-ring-metal)" strokeWidth={1}
          strokeDasharray="2 10" opacity={0.6}
          style={spin("60s", true)}
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
