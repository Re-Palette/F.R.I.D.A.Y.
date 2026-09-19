"use client";

import { useSystemMetrics, type Metric } from "@/lib/system-metrics";

const SIZE = 56;
const R = 22;
const CIRCUMFERENCE = 2 * Math.PI * R;

/**
 * Four dials across the top-left corner. What they show is real — see
 * system-metrics.ts — so a browser that won't answer gets an empty dial
 * rather than a convincing number.
 */
export function SystemMetrics() {
  const metrics = useSystemMetrics();
  return (
    <div className="flex items-start gap-3">
      {metrics.map((metric) => (
        <Dial key={metric.label} metric={metric} />
      ))}
    </div>
  );
}

function Dial({ metric }: { metric: Metric }) {
  const percent = metric.percent ?? 0;
  return (
    <div className="flex flex-col items-center gap-1.5" title={metric.detail || undefined}>
      <div className="relative" style={{ width: SIZE, height: SIZE }}>
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="h-full w-full -rotate-90 overflow-visible">
          <circle
            cx={SIZE / 2} cy={SIZE / 2} r={R}
            fill="none" stroke="var(--hud-orange)" strokeWidth={3} opacity={0.16}
          />
          <circle
            cx={SIZE / 2} cy={SIZE / 2} r={R}
            fill="none" stroke="var(--hud-orange)" strokeWidth={3} strokeLinecap="butt"
            strokeDasharray={`${(percent / 100) * CIRCUMFERENCE} ${CIRCUMFERENCE}`}
            className="[filter:drop-shadow(0_0_5px_rgba(255,122,26,0.8))] transition-[stroke-dasharray] duration-700"
          />
          {/* Tick marks around the outside, so the ring reads as a scale. */}
          {Array.from({ length: 24 }, (_, i) => (
            <line
              key={i}
              x1={SIZE / 2} y1={2} x2={SIZE / 2} y2={4.5}
              stroke="var(--hud-orange)" strokeWidth={1} opacity={0.35}
              transform={`rotate(${i * 15} ${SIZE / 2} ${SIZE / 2})`}
            />
          ))}
        </svg>
        <span className="absolute inset-0 flex items-center justify-center font-[family-name:var(--font-mono)] text-[13px] text-[var(--hud-orange-bright)]">
          {metric.value}
        </span>
      </div>
      <span className="font-[family-name:var(--font-hud)] text-[8px] tracking-[0.18em] text-[var(--hud-text-dim)]">
        {metric.label}
      </span>
    </div>
  );
}
