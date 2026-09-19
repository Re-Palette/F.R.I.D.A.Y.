"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { configuredReadings, toSpeakable } from "@/lib/speech-text";

/**
 * Voice in and out, through the browser.
 *
 * Anthropic has no speech endpoint, so the alternative to this would be a
 * third paid provider and a third key — the same trade the memory store
 * faced. The browser's own APIs cost nothing and send nothing anywhere this
 * app has to pay for.
 *
 * The price is that support is uneven: SpeechRecognition is a Chrome-family
 * API, and a machine with no installed voices has no speech output at all.
 * So everything here is behind feature detection, and the UI only offers
 * what the browser in front of it can actually do — an inert microphone
 * button is worse than none.
 */

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<
    ArrayLike<{ transcript: string }> & { isFinal: boolean }
  >;
}

type RecognitionCtor = new () => SpeechRecognitionLike;

/** Shared with wake-word.ts, which runs a recognition of its own. */
export type { SpeechRecognitionLike, SpeechRecognitionEventLike };

export function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export interface SpeechInput {
  supported: boolean;
  listening: boolean;
  /** What has been heard so far, including the not-yet-final part. */
  transcript: string;
  error: string | null;
  start: () => void;
  stop: () => void;
}

/**
 * Whether the browser has these APIs, answered SSR-safely.
 *
 * It has to be read through useSyncExternalStore rather than an effect: the
 * server has no `window`, so resolving it during render would make the
 * markup disagree with the client's and setting it from an effect would
 * cascade a render. `false` on the server means the controls appear once
 * hydration confirms they work, which is the right way round.
 */
const NEVER_CHANGES = () => () => {};

export function useSpeechInputSupported(): boolean {
  return useSyncExternalStore(NEVER_CHANGES, () => recognitionCtor() !== null, () => false);
}

export function useSpeechOutputSupported(): boolean {
  return useSyncExternalStore(NEVER_CHANGES, speechOutputSupported, () => false);
}

export interface SpeechInputOptions {
  lang?: string;
  /**
   * Called when a listen ends having heard nothing — the caller can tell
   * "they stopped talking" apart from "they never started", which a
   * continuous conversation needs in order to stop rather than sit with the
   * microphone open.
   */
  onSilence?: () => void;
}

export function useSpeechInput(
  onFinal: (text: string) => void,
  options: SpeechInputOptions = {}
): SpeechInput {
  const { lang = "ja-JP", onSilence } = options;
  const supported = useSpeechInputSupported();
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recognition = useRef<SpeechRecognitionLike | null>(null);

  // The callback is read through a ref so that changing it — which it does
  // on every render of the caller — doesn't tear down a live recognition.
  // Written from an effect rather than during render, which would be a
  // side effect in a place React makes no promises about.
  const finalHandler = useRef(onFinal);
  const silenceHandler = useRef(onSilence);
  useEffect(() => {
    finalHandler.current = onFinal;
    silenceHandler.current = onSilence;
  }, [onFinal, onSilence]);

  const start = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor || recognition.current) return;

    const r = new Ctor();
    r.lang = lang;
    // One utterance at a time: press, speak, done. Continuous listening is a
    // different feature with different consent expectations.
    r.continuous = false;
    r.interimResults = true;
    r.maxAlternatives = 1;

    let finalText = "";

    r.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0].transcript;
        if (result.isFinal) finalText += text;
        else interim += text;
      }
      setTranscript(finalText + interim);
    };

    r.onerror = (event) => {
      // "no-speech" and "aborted" are ordinary outcomes of pressing the
      // button and not speaking; surfacing them as failures would be noise.
      if (event.error !== "no-speech" && event.error !== "aborted") {
        setError(
          event.error === "not-allowed"
            ? "マイクの使用が許可されていません。"
            : `音声入力に失敗しました（${event.error}）`
        );
      }
      setListening(false);
    };

    r.onend = () => {
      recognition.current = null;
      setListening(false);
      const text = finalText.trim();
      if (text) finalHandler.current(text);
      else silenceHandler.current?.();
      setTranscript("");
    };

    recognition.current = r;
    setError(null);
    setTranscript("");
    setListening(true);

    // Chrome refuses a start while another recognition is still releasing the
    // microphone, which is exactly what a handover from the wake listener
    // looks like. One retry covers it; the alternative is a dropped turn.
    try {
      r.start();
    } catch {
      setTimeout(() => {
        if (recognition.current !== r) return;
        try {
          r.start();
        } catch {
          recognition.current = null;
          setListening(false);
        }
      }, 250);
    }
  }, [lang]);

  const stop = useCallback(() => {
    recognition.current?.stop();
  }, []);

  // A recognition still running when the component goes away would keep the
  // microphone open with nothing listening to it.
  useEffect(() => () => recognition.current?.abort(), []);

  return { supported, listening, transcript, error, start, stop };
}

export function speechOutputSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/**
 * Audio currently playing, and the counter that decides who owns the speaker.
 *
 * Every utterance takes a number; anything that starts speaking, or stops
 * speech, takes the next one. Audio that is still being fetched when the
 * conversation has moved on therefore finds its number stale and throws
 * itself away, instead of arriving late and talking over the answer that
 * replaced it.
 */
let generation = 0;
// Until /api/speech says otherwise, assume a voice is configured.
let voiceConfigured = true;
let playing: HTMLAudioElement | null = null;
let playingUrl: string | null = null;

function releaseAudio() {
  if (playing) {
    playing.pause();
    playing.src = "";
    playing = null;
  }
  if (playingUrl) {
    URL.revokeObjectURL(playingUrl);
    playingUrl = null;
  }
}

/**
 * Audio for one piece of text. Null means the browser should say this one —
 * no voice configured, the quota gone, or the request failed.
 */
async function fetchVoice(text: string): Promise<Blob | null> {
  if (!voiceConfigured) return null;
  try {
    const res = await fetch("/api/speech", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      // 503 is the route saying no voice is set up, which will be just as
      // true next time: remembering it keeps every later reply from paying
      // for a round trip to find that out again. Other failures may well be
      // transient, so those are retried.
      if (res.status === 503) voiceConfigured = false;
      return null;
    }
    return await res.blob();
  } catch (err) {
    console.error("Voice request failed:", err);
    return null;
  }
}

/** Resolves false when the browser refused to play it, so it can be spoken
 *  the other way rather than silently skipped. */
function playVoice(blob: Blob, mine: number, onSound: () => void): Promise<boolean> {
  return new Promise((resolve) => {
    if (mine !== generation) return resolve(true);

    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    playing = audio;
    playingUrl = url;

    let settled = false;
    const done = (played: boolean) => {
      if (settled) return;
      settled = true;
      if (mine === generation) releaseAudio();
      resolve(played);
    };

    audio.onplaying = onSound;
    audio.onended = () => done(true);
    // A chunk that fails halfway has already been partly heard; saying it
    // again through the other path would be worse than losing the rest.
    audio.onerror = () => done(true);
    audio.play().catch((err) => {
      // Autoplay refused. The browser's own synthesis is held to a different
      // policy, so it is worth trying rather than going silent.
      console.error("Voice playback refused:", err);
      done(false);
    });
  });
}

function speakWithBrowser(text: string, lang: string, mine: number, onSound: () => void): Promise<void> {
  return new Promise((resolve) => {
    if (!speechOutputSupported() || mine !== generation) return resolve();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;

    // A machine with no installed voices accepts the utterance and then never
    // says anything or reports anything, which in a conversation that listens
    // again when speech ends means it simply stops. The watchdog is what keeps
    // that from being a dead end; it is generous enough never to cut real
    // speech short.
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(watchdog);
      resolve();
    };
    const watchdog = setTimeout(finish, 5000 + text.length * 90);

    utterance.onstart = onSound;
    utterance.onend = finish;
    // A failed utterance must still release whoever is waiting on it.
    utterance.onerror = finish;

    // Voices load asynchronously on some platforms, so an empty list here
    // means "not ready yet" rather than "none available" — the default voice
    // still speaks.
    const voice = window.speechSynthesis.getVoices().find((v) => v.lang.startsWith(lang.slice(0, 2)));
    if (voice) utterance.voice = voice;

    window.speechSynthesis.speak(utterance);
  });
}

export interface SpeechSession {
  /** Say this next, after whatever is already queued. */
  push: (text: string) => void;
  /** Nothing more is coming; onEnd fires once the queue drains. */
  end: () => void;
}

export interface SpeakOptions {
  lang?: string;
  /** Fires when sound actually starts, not when it was asked for. */
  onStart?: () => void;
  onEnd?: () => void;
}

/**
 * Speaks a reply that is still being written.
 *
 * Waiting for a whole answer before saying any of it means waiting for the
 * model to finish, then for the voice to render all of it, and only then
 * hearing the first word. Pushed a sentence at a time, each one is sent for
 * synthesis the moment it exists — so later sentences are being rendered
 * while the first is already playing, and the wait is one sentence long
 * instead of the whole reply.
 *
 * Order is preserved regardless: they are awaited in the order they were
 * pushed, however the requests come back.
 */
export function startSpeaking(options: SpeakOptions = {}): SpeechSession {
  const { lang = "ja-JP", onStart, onEnd } = options;

  stopSpeaking();
  const mine = generation;

  const queue: Array<{ text: string; audio: Promise<Blob | null> }> = [];
  let next = 0;
  let ended = false;
  let draining = false;
  let sounded = false;
  let finished = false;

  const onSound = () => {
    if (sounded) return;
    sounded = true;
    onStart?.();
  };

  const finish = () => {
    if (finished || mine !== generation) return;
    finished = true;
    onEnd?.();
  };

  const drain = async () => {
    if (draining) return;
    draining = true;

    while (next < queue.length) {
      if (mine !== generation) {
        draining = false;
        return;
      }
      const item = queue[next++];
      const blob = await item.audio;
      if (mine !== generation) {
        draining = false;
        return;
      }
      if (blob ? !(await playVoice(blob, mine, onSound)) : true) {
        await speakWithBrowser(item.text, lang, mine, onSound);
      }
    }

    draining = false;
    if (ended) finish();
  };

  return {
    push(raw: string) {
      if (mine !== generation) return;
      // What is spoken is not what is shown: a reply written for the eye
      // reads terribly out loud. See speech-text.ts.
      const text = toSpeakable(raw, configuredReadings());
      if (!text) return;
      // The request goes out now, not when its turn comes.
      queue.push({ text, audio: fetchVoice(text) });
      void drain();
    },
    end() {
      ended = true;
      if (!draining) finish();
    },
  };
}

/**
 * Reads `text` aloud in one go, replacing anything already being spoken.
 *
 * The whole-answer-at-once form of startSpeaking, for callers that have the
 * whole answer.
 */
export function speak(text: string, options: SpeakOptions = {}) {
  const session = startSpeaking(options);
  session.push(text);
  session.end();
}

export function stopSpeaking() {
  generation++;
  releaseAudio();
  if (speechOutputSupported()) window.speechSynthesis.cancel();
}

/**
 * Whether replies are read aloud — a per-viewer convenience, so localStorage
 * is the right home for it, and every access is guarded: a private window or
 * blocked site data makes these throw, and losing the preference is a far
 * better outcome than losing the toggle.
 *
 * Held in a module-level store so the snapshot stays referentially stable,
 * which is what useSyncExternalStore requires.
 */
const SPEAK_PREFERENCE_KEY = "friday:speak-replies";
const preferenceListeners = new Set<() => void>();
let speakPreference: boolean | null = null;

function readSpeakPreference(): boolean {
  if (speakPreference === null) {
    try {
      speakPreference = localStorage.getItem(SPEAK_PREFERENCE_KEY) === "1";
    } catch {
      speakPreference = false;
    }
  }
  return speakPreference;
}

export function useSpeakReplies(): [boolean, (next: boolean) => void] {
  const enabled = useSyncExternalStore(
    (notify) => {
      preferenceListeners.add(notify);
      return () => preferenceListeners.delete(notify);
    },
    readSpeakPreference,
    () => false
  );

  const set = useCallback((next: boolean) => {
    speakPreference = next;
    if (!next) stopSpeaking();
    try {
      localStorage.setItem(SPEAK_PREFERENCE_KEY, next ? "1" : "0");
    } catch {
      // Not persisting the choice beats breaking the toggle.
    }
    preferenceListeners.forEach((notify) => notify());
  }, []);

  return [enabled, set];
}
