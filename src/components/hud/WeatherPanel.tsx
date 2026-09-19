import type { ReactNode } from "react";
import { HudPanel } from "./HudPanel";

/**
 * The weather frame, deliberately without weather.
 *
 * Nothing here calls an API and nothing here invents a temperature: the
 * panel exists so that real readings have somewhere to land, and a plausible
 * "29°C" sitting on a personal dashboard is worse than an obviously empty
 * slot. Pass `children` to fill it.
 */
export function WeatherPanel({ children, place = "TOKYO" }: { children?: ReactNode; place?: string }) {
  return (
    <HudPanel title={`WEATHER / ${place}`} bodyClassName="p-3">
      {children ?? (
        <div className="flex h-[124px] flex-col items-center justify-center gap-2 border border-dashed border-[rgba(255,122,26,0.28)]">
          <span className="font-[family-name:var(--font-hud)] text-[10px] tracking-[0.22em] text-[var(--hud-orange-dim)]">
            NO FEED
          </span>
          <span className="text-[9px] tracking-[0.1em] text-[var(--hud-text-dim)]">
            気象データ未接続
          </span>
        </div>
      )}
    </HudPanel>
  );
}
