"use client";

import { useEffect, useState } from "react";
import { HudPanel } from "./HudPanel";
import { WeatherIcon } from "./WeatherIcon";
import type { WeatherReport } from "@/lib/integrations/weather";

/** Weather changes slowly, and the route caches for ten minutes anyway. */
const REFRESH_MS = 10 * 60 * 1000;

type State =
  | { status: "loading" }
  | { status: "ready"; report: WeatherReport }
  | { status: "failed" };

/**
 * WEATHER / TOKYO.
 *
 * Real readings, from /api/weather — where there is no forecast, or the
 * lookup fails, it says so rather than showing a plausible number. A weather
 * panel is only worth anything if you can believe it without checking.
 */
export function WeatherPanel({ place = "TOKYO" }: { place?: string }) {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    const load = () => {
      void fetch("/api/weather")
        .then(async (res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return (await res.json()) as WeatherReport;
        })
        .then((report) => {
          if (!cancelled) setState({ status: "ready", report });
        })
        .catch((err) => {
          console.error("Weather unavailable:", err);
          if (!cancelled) setState({ status: "failed" });
        });
    };

    load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const heading = state.status === "ready" ? state.report.place : place;

  return (
    <HudPanel title={`WEATHER / ${heading}`} bodyClassName="p-3">
      {state.status === "ready" ? (
        <div className="flex items-stretch gap-3">
          <div
            className="flex flex-col items-center justify-center gap-1 pr-3"
            title={state.report.label}
          >
            <span className="text-[var(--hud-orange-bright)] [filter:drop-shadow(0_0_6px_rgba(255,122,26,0.55))]">
              <WeatherIcon sky={state.report.sky} size={40} night={!state.report.isDay} />
            </span>
            <span className="font-[family-name:var(--font-mono)] text-[22px] leading-none text-[var(--hud-orange-bright)]">
              {state.report.temperature}°
            </span>
            <span className="text-[9px] text-[var(--hud-text-dim)]">{state.report.label}</span>
          </div>

          <ul className="flex flex-1 flex-col justify-center gap-[3px] border-l border-[var(--hud-line)] pl-3">
            {state.report.days.map((day) => (
              <li key={day.day} className="flex items-center gap-2">
                <span className="w-8 font-[family-name:var(--font-hud)] text-[9px] tracking-[0.12em] text-[var(--hud-text-dim)]">
                  {day.day}
                </span>
                <span className="text-[var(--hud-orange)]">
                  <WeatherIcon sky={day.sky} size={15} />
                </span>
                <span className="ml-auto font-[family-name:var(--font-mono)] text-[11px] text-[var(--hud-text)]">
                  {day.high}° <span className="text-[var(--hud-orange-dim)]">/ {day.low}°</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="flex h-[108px] flex-col items-center justify-center gap-2 border border-dashed border-[rgba(255,122,26,0.28)]">
          <span className="font-[family-name:var(--font-hud)] text-[10px] tracking-[0.22em] text-[var(--hud-orange-dim)]">
            {state.status === "loading" ? "SYNCING" : "NO FEED"}
          </span>
          <span className="text-[9px] tracking-[0.1em] text-[var(--hud-text-dim)]">
            {state.status === "loading" ? "気象データ取得中" : "気象データを取得できません"}
          </span>
        </div>
      )}
    </HudPanel>
  );
}
