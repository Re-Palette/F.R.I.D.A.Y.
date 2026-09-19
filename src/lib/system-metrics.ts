"use client";

import { useEffect, useState } from "react";

/**
 * The four readouts in the top-left corner.
 *
 * The reference shows CPU, MEM, STORAGE and NET as filled rings, and the
 * easy thing would be to write 68, 72, 63 and 88 into the markup. These
 * read the real thing instead, from what the browser will actually tell a
 * page — a dial that always says 68 is a picture of a dial.
 *
 * Each of these is optional and browser-specific, so a reading that isn't
 * available says so rather than inventing one.
 */
export interface Metric {
  label: string;
  /** 0–100 for the ring, or null when the browser won't say. */
  percent: number | null;
  /** What to print in the middle. */
  value: string;
  /** Expanded meaning, for the title attribute. */
  detail: string;
}

interface ChromeMemory {
  usedJSHeapSize: number;
  jsHeapSizeLimit: number;
}

interface NetworkInformation {
  downlink?: number;
  effectiveType?: string;
}

const UNKNOWN = { percent: null, value: "--" };

/** A real but sub-1% reading, shown as such rather than rounded to a zero
 *  that looks like a fault. */
function atLeast(percent: number): string {
  if (percent >= 1) return String(Math.round(percent));
  return percent > 0 ? "<1" : "0";
}

function cpu(): Omit<Metric, "label"> {
  const cores = typeof navigator !== "undefined" ? navigator.hardwareConcurrency : undefined;
  if (!cores) return { ...UNKNOWN, detail: "論理コア数を取得できません" };
  // Against 16, which puts a typical laptop around the middle of the dial.
  return {
    percent: Math.min(100, Math.round((cores / 16) * 100)),
    value: String(cores),
    detail: `論理コア ${cores}`,
  };
}

function memory(): Omit<Metric, "label"> {
  // Installed memory first: a JS heap sitting at 0% of its limit is true and
  // tells nobody anything, whereas "8" GB is a fact about the machine.
  const gb = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  if (gb) {
    return {
      percent: Math.min(100, Math.round((gb / 16) * 100)),
      value: String(gb),
      detail: `搭載メモリ 約${gb}GB`,
    };
  }
  const perf = performance as Performance & { memory?: ChromeMemory };
  if (perf.memory?.jsHeapSizeLimit) {
    const used = perf.memory.usedJSHeapSize / perf.memory.jsHeapSizeLimit;
    return {
      percent: Math.round(used * 100),
      value: atLeast(used * 100),
      detail: `JSヒープ使用率 ${(perf.memory.usedJSHeapSize / 1024 / 1024).toFixed(0)}MB`,
    };
  }
  return { ...UNKNOWN, detail: "メモリ情報を取得できません" };
}

async function storage(): Promise<Omit<Metric, "label">> {
  if (!navigator.storage?.estimate) return { ...UNKNOWN, detail: "ストレージ情報を取得できません" };
  try {
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    if (!quota) return { ...UNKNOWN, detail: "ストレージ割り当てが不明です" };
    const percent = (usage / quota) * 100;
    return {
      percent: Math.round(percent),
      value: atLeast(percent),
      detail: `${(usage / 1024 / 1024).toFixed(1)}MB / ${(quota / 1024 / 1024 / 1024).toFixed(1)}GB`,
    };
  } catch {
    return { ...UNKNOWN, detail: "ストレージ情報を取得できません" };
  }
}

function network(): Omit<Metric, "label"> {
  const connection = (navigator as Navigator & { connection?: NetworkInformation }).connection;
  if (!navigator.onLine) return { percent: 0, value: "OFF", detail: "オフライン" };
  if (!connection?.downlink) return { ...UNKNOWN, detail: "回線情報を取得できません" };
  // 10Mbps is treated as a full dial; above that the difference stops
  // meaning anything to a page like this one.
  return {
    percent: Math.min(100, Math.round((connection.downlink / 10) * 100)),
    value: atLeast(connection.downlink),
    detail: `下り 約${connection.downlink}Mbps${connection.effectiveType ? ` / ${connection.effectiveType}` : ""}`,
  };
}

const PLACEHOLDER: Metric[] = [
  { label: "CPU", ...UNKNOWN, detail: "" },
  { label: "MEM", ...UNKNOWN, detail: "" },
  { label: "STORAGE", ...UNKNOWN, detail: "" },
  { label: "NET", ...UNKNOWN, detail: "" },
];

async function readAll(): Promise<Metric[]> {
  return [
    { label: "CPU", ...cpu() },
    { label: "MEM", ...memory() },
    { label: "STORAGE", ...(await storage()) },
    { label: "NET", ...network() },
  ];
}

export function useSystemMetrics(): Metric[] {
  // Unknown until hydration: none of this exists on the server, and
  // rendering a guess would be markup the client disagrees with.
  const [metrics, setMetrics] = useState<Metric[]>(PLACEHOLDER);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      void readAll().then((next) => {
        if (!cancelled) setMetrics(next);
      });
    };
    refresh();
    const id = setInterval(refresh, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return metrics;
}
