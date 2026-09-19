import { HudPanel } from "./HudPanel";

/**
 * SYSTEM STATUS.
 *
 * These three are the one part of the HUD that isn't reporting anything: a
 * browser has no power grid and no shield array. They are set dressing,
 * carried over from the reference because the panel is part of the look —
 * which is why the numbers are here, in plain sight, rather than dressed up
 * as a reading. Anything genuinely measurable lives in SystemMetrics, where
 * the values come from the machine.
 */
const READOUTS = [
  { label: "POWER GRID", value: 82 },
  { label: "SHIELD ARRAY", value: 66 },
  { label: "STRUCTURAL INTEGRITY", value: 94 },
];

export function SystemStatus() {
  return (
    <HudPanel title="SYSTEM STATUS" bodyClassName="flex flex-col gap-3 px-3 py-3">
      {READOUTS.map(({ label, value }) => (
        <div key={label} className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-[family-name:var(--font-hud)] text-[9px] tracking-[0.14em] text-[var(--hud-text-dim)]">
              {label}
            </span>
            <span className="font-[family-name:var(--font-mono)] text-[10px] text-[var(--hud-orange-bright)]">
              {value}%
            </span>
          </div>
          <div className="h-[5px] w-full bg-[rgba(255,122,26,0.12)]">
            <div
              className="h-full bg-[var(--hud-orange)] shadow-[0_0_8px_rgba(255,122,26,0.7)]"
              style={{ width: `${value}%` }}
            />
          </div>
        </div>
      ))}
    </HudPanel>
  );
}
