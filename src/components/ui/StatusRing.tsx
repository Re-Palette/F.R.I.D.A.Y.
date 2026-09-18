"use client";

interface StatusRingProps {
  size?: number;
  active?: boolean;
  label?: string;
}

/**
 * The concentric-ring / orbit motif from the reference hero, repurposed as
 * the agent "thinking / working" indicator. Pure SVG + CSS animation, no
 * asset dependency.
 */
export function StatusRing({ size = 160, active = true, label }: StatusRingProps) {
  const center = size / 2;
  const rings = [
    { r: size * 0.46, width: 1, dash: "2 6", duration: "40s" },
    { r: size * 0.38, width: 1, dash: "1 4", duration: "28s", reverse: true },
    { r: size * 0.3, width: 1.5, dash: "10 4", duration: "18s" },
  ];

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="absolute inset-0">
        {rings.map((ring, i) => (
          <circle
            key={i}
            cx={center}
            cy={center}
            r={ring.r}
            fill="none"
            stroke="var(--color-ring-metal)"
            strokeWidth={ring.width}
            strokeDasharray={ring.dash}
            className={active ? "animate-spin" : undefined}
            style={{
              animationDuration: ring.duration,
              animationDirection: ring.reverse ? "reverse" : "normal",
              animationTimingFunction: "linear",
              transformOrigin: "center",
            }}
          />
        ))}
        <circle
          cx={center}
          cy={center}
          r={size * 0.14}
          fill="var(--color-accent)"
          opacity={active ? 0.9 : 0.3}
          className={active ? "animate-pulse" : undefined}
          style={{ filter: "blur(6px)" }}
        />
        <circle cx={center} cy={center} r={2} fill="var(--color-accent-soft)" />
      </svg>
      {label && (
        <span className="relative z-10 text-[9px] uppercase tracking-[var(--tracking-wide)] text-fg-muted">
          {label}
        </span>
      )}
    </div>
  );
}
