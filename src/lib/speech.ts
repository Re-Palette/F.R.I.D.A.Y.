"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

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

function recognitionCtor(): RecognitionCtor | null {
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
    r.start();
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
 * Reads `text` aloud, replacing anything already being spoken.
 *
 * `onEnd` is what makes a back-and-forth possible: it fires when the reply
 * has finished being spoken, which is the moment to listen again. It also
 * fires when speech is unavailable or the text is empty, so a caller waiting
 * on it is never left waiting forever.
 */
export function speak(text: string, options: { lang?: string; onEnd?: () => void } = {}) {
  const { lang = "ja-JP", onEnd } = options;
  const trimmed = text.trim();
  if (!speechOutputSupported() || !trimmed) {
    onEnd?.();
    return;
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(trimmed);
  utterance.lang = lang;
  utterance.onend = () => onEnd?.();
  // A failed utterance must still release whoever is waiting on it.
  utterance.onerror = () => onEnd?.();

  // Voices load asynchronously on some platforms, so an empty list here
  // means "not ready yet" rather than "none available" — the default voice
  // still speaks.
  const voice = window.speechSynthesis.getVoices().find((v) => v.lang.startsWith(lang.slice(0, 2)));
  if (voice) utterance.voice = voice;

  window.speechSynthesis.speak(utterance);
}

export function stopSpeaking() {
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
