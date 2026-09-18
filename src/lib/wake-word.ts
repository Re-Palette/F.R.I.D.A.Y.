"use client";

import { useCallback, useSyncExternalStore } from "react";
import { recognitionCtor } from "@/lib/speech";

/**
 * Being called by name.
 *
 * Browsers have no wake-word API, so this is the only way it can be done
 * here: a recognition left running continuously while nothing else is
 * happening, watching the words go by for its own name. That is a real cost
 * — the microphone stays open and Chrome streams what it hears to Google's
 * speech service the whole time — which is why it is a setting that is off
 * until switched on, rather than something the app simply does.
 *
 * It runs only while idle. During a conversation the microphone belongs to
 * the turn being taken, and two recognitions competing for it would take
 * each other down.
 */

/**
 * Speech recognition renders a name however it hears it, and "フライデー"
 * lands on a handful of neighbours often enough to be worth accepting. The
 * cost of a wrong one is small — it starts listening when it shouldn't, and
 * silence puts it straight back — while a name that only works on the third
 * try isn't worth calling.
 *
 * 金曜日 is deliberately absent: it is what the word means, it comes up in
 * ordinary conversation, and waking on it would be indistinguishable from a
 * fault.
 */
const WAKE = /フライデー|フライデイ|ふらいでー|ブライデー|プライデー|ﾌﾗｲﾃﾞｰ|friday/i;

export interface WakeMatch {
  matched: boolean;
  /** Anything said after the name — "フライデー、明日の予定は？" carries its own question. */
  rest: string;
}

export function matchWakeWord(transcript: string): WakeMatch {
  const found = WAKE.exec(transcript);
  if (!found) return { matched: false, rest: "" };

  const rest = transcript
    .slice(found.index + found[0].length)
    .replace(/^[\s、。，．！!？?,.・:：]+/, "")
    .trim();
  return { matched: true, rest };
}

export interface WakeListener {
  stop: () => void;
}

interface WakeOptions {
  onWake: (rest: string) => void;
  onError?: (message: string) => void;
  lang?: string;
}

/**
 * Listens until the name is heard, then hands over and stops.
 *
 * Chrome ends a continuous recognition on its own every so often, so the
 * loop restarts it; that restart *is* the continuity. Failures back off
 * rather than spinning, because a recognition that cannot start is usually
 * a microphone that has gone away rather than a moment's bad luck.
 */
export function startWakeListening({ onWake, onError, lang = "ja-JP" }: WakeOptions): WakeListener {
  let stopped = false;
  let failures = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let active: { abort: () => void } | null = null;

  const run = () => {
    if (stopped) return;
    const Ctor = recognitionCtor();
    if (!Ctor) return;

    const r = new Ctor();
    r.lang = lang;
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 1;

    r.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        // Interim results are read too: waiting for the sentence to be final
        // would mean answering a call several seconds after it was made.
        const { matched, rest } = matchWakeWord(event.results[i][0].transcript);
        if (!matched) continue;
        stopped = true;
        active = null;
        r.abort();
        onWake(rest);
        return;
      }
    };

    r.onerror = (event) => {
      if (event.error === "not-allowed") {
        stopped = true;
        onError?.("マイクの使用が許可されていません。");
        return;
      }
      // Hearing nothing is the normal state of waiting to be called.
      if (event.error !== "no-speech" && event.error !== "aborted") failures++;
    };

    r.onend = () => {
      active = null;
      if (stopped) return;
      const delay = failures ? Math.min(1000 * 2 ** failures, 30000) : 250;
      timer = setTimeout(run, delay);
    };

    active = r;
    try {
      r.start();
      failures = 0;
    } catch {
      active = null;
      failures++;
      timer = setTimeout(run, Math.min(1000 * 2 ** failures, 30000));
    }
  };

  run();

  return {
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      // abort, not stop: this is a handover, and a recognition winding down
      // gracefully still holds the microphone the next one needs.
      active?.abort();
      active = null;
    },
  };
}

/**
 * Whether being called by name is switched on — a per-viewer choice, stored
 * the same way and for the same reasons as the read-aloud preference in
 * speech.ts, and guarded the same way because these throw in a private
 * window.
 */
const WAKE_PREFERENCE_KEY = "friday:wake-word";
const listeners = new Set<() => void>();
let preference: boolean | null = null;

function readPreference(): boolean {
  if (preference === null) {
    try {
      preference = localStorage.getItem(WAKE_PREFERENCE_KEY) === "1";
    } catch {
      preference = false;
    }
  }
  return preference;
}

export function useWakeWord(): [boolean, (next: boolean) => void] {
  const enabled = useSyncExternalStore(
    (notify) => {
      listeners.add(notify);
      return () => listeners.delete(notify);
    },
    readPreference,
    () => false
  );

  const set = useCallback((next: boolean) => {
    preference = next;
    try {
      localStorage.setItem(WAKE_PREFERENCE_KEY, next ? "1" : "0");
    } catch {
      // Not persisting the choice beats breaking the switch.
    }
    listeners.forEach((notify) => notify());
  }, []);

  return [enabled, set];
}
