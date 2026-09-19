"use client";

import { useHudClock } from "@/lib/hud-clock";

const VB = 200;
const C = VB / 2;
const RINGS = [24, 48, 72, 92];
// Fixed positions: a radar whose contacts move at random is a screensaver.
const CONTACTS = [
  { x: 128, y: 74, r: 2.4 },
  { x: 84, y: 118, r: 1.8 },
  { x: 141, y: 128, r: 1.4 },
  { x: 66, y: 82, r: 1.6 },
];

export function RadarPanel() {
  const clock = useHudClock();

  return (
    <div className="flex flex-col gap-2">
      <div className="relative w-full max-w-[190px]">
        <svg viewBox={`0 0 ${VB} ${VB}`} className="h-full w-full">
          <defs>
            <linearGradient id="radar-sweep" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="var(--hud-orange)" stopOpacity="0" />
              <stop offset="100%" stopColor="var(--hud-orange-bright)" stopOpacity="0.45" />
            </linearGradient>
          </defs>

          {RINGS.map((r) => (
            <circle key={r} cx={C} cy={C} r={r} fill="none" stroke="var(--hud-line)" strokeWidth={1} opacity={0.5} />
          ))}
          {[0, 45, 90, 135].map((deg) => (
            <line
              key={deg}
              x1={C - 92} y1={C} x2={C + 92} y2={C}
              stroke="var(--hud-line)" strokeWidth={1} opacity={0.3}
              transform={`rotate(${deg} ${C} ${C})`}
            />
          ))}

          <g className="hud-sweep" style={{ "--hud-duration": "4.5s" } as React.CSSProperties}>
            <path d={`M ${C} ${C} L ${C + 92} ${C - 34} A 92 92 0 0 1 ${C + 92} ${C + 34} Z`} fill="url(#radar-sweep)" />
          </g>

          {CONTACTS.map((contact, i) => (
            <circle
              key={`${contact.x}-${contact.y}`}
              cx={contact.x} cy={contact.y} r={contact.r}
              fill="var(--hud-orange-bright)"
              className="hud-pulse [filter:drop-shadow(0_0_4px_rgba(255,122,26,0.9))]"
              style={{ "--hud-duration": "3s", "--hud-delay": `${i * 0.7}s` } as React.CSSProperties}
            />
          ))}

          <circle cx={C} cy={C} r={2} fill="var(--hud-orange-bright)" />
        </svg>
      </div>

      <div className="flex items-end gap-2 border-l border-[var(--hud-line-strong)] pl-2">
        <div>
          <p className="font-[family-name:var(--font-hud)] text-[9px] tracking-[0.2em] text-[var(--hud-orange)]">
            LOCAL
          </p>
          <p className="font-[family-name:var(--font-mono)] text-[10px] text-[var(--hud-text-dim)]">
            TOKYO / {clock ? `${clock.date.slice(0, 10)} ${clock.time.slice(0, 5)}` : "--"}
          </p>
        </div>
      </div>
    </div>
  );
}
