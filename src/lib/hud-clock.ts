"use client";

import { useSyncExternalStore } from "react";

/**
 * The wall clock, read SSR-safely.
 *
 * The server has no idea what time it is where the screen is, so rendering a
 * time during SSR guarantees markup that disagrees with the client's. It is
 * read through useSyncExternalStore for the same reason the speech
 * capabilities are: null on the server, real once hydrated.
 *
 * The snapshot is a single string rather than a Date because
 * useSyncExternalStore compares snapshots by identity — a fresh Date every
 * call would report a change on every render and never settle.
 */
const DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const listeners = new Set<() => void>();
let snapshot: string | null = null;
let timer: ReturnType<typeof setInterval> | null = null;

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function read(): string {
  const d = new Date();
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  const date = `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${DAYS[d.getDay()]}`;
  return `${time}|${date}`;
}

function tick() {
  const next = read();
  if (next === snapshot) return;
  snapshot = next;
  listeners.forEach((notify) => notify());
}

function subscribe(notify: () => void) {
  listeners.add(notify);
  if (!timer) {
    tick();
    timer = setInterval(tick, 1000);
  }
  return () => {
    listeners.delete(notify);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

export interface HudClock {
  time: string;
  date: string;
}

export function useHudClock(): HudClock | null {
  const value = useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => null
  );
  if (!value) return null;
  const [time, date] = value.split("|");
  return { time, date };
}
