"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { speak, stopSpeaking, useSpeechInput } from "@/lib/speech";
import { releaseMicrophone, watchForInterruption, type ActivityMonitor } from "@/lib/voice-activity";
import { startWakeListening, useWakeWord } from "@/lib/wake-word";

export type VoicePhase = "idle" | "listening" | "thinking" | "speaking";

export interface VoiceConversation {
  /** False until hydration confirms the browser can listen. */
  supported: boolean;
  phase: VoicePhase;
  /** Idle, but listening for its own name rather than waiting to be touched. */
  waiting: boolean;
  /** What was just said — live while listening, then kept for context. */
  heard: string;
  /** The reply, shown as a subtitle while it is read aloud. */
  reply: string;
  error: string | null;
  /** Starts the conversation, or ends it if one is already running. */
  toggle: () => void;
  wakeEnabled: boolean;
  setWakeEnabled: (next: boolean) => void;
}

const FAILED = "応答を取得できませんでした。";

/**
 * A conversation held entirely out loud.
 *
 * The difference from a microphone button is that this doesn't stop after
 * one answer. A reply finishing being spoken is the cue to listen again, so
 * turns follow each other; and a reply does not have to finish, because
 * speaking over it cuts it off and hands the turn back — waiting politely
 * for a machine to reach its full stop is the thing that makes it feel like
 * a machine. It ends when the user says nothing, or touches the ring.
 *
 * With the wake word switched on it doesn't wait to be touched at all: it
 * listens for its own name whenever nothing else is happening. That costs
 * an open microphone, so it is a setting rather than the default — see
 * wake-word.ts.
 *
 * Nothing about what is stored changes: every turn still goes through
 * /api/chat into the same conversation row, so the history screens see
 * exactly what typing would have produced.
 */
export function useVoiceConversation(): VoiceConversation {
  const [phase, setPhase] = useState<VoicePhase>("idle");
  const [heard, setHeard] = useState("");
  const [reply, setReply] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [wakeEnabled, setWakeEnabled] = useWakeWord();

  // Every turn joins the same conversation, created on the first one.
  const conversationId = useRef<string | null>(null);
  // Distinguishes "the reply finished, so listen again" from "the user ended
  // it", which must not restart — and lets a reply that arrives after the
  // user has stopped be discarded rather than spoken at them.
  const conversing = useRef(false);
  // `start` is needed inside the handler that `useSpeechInput` is given,
  // which is defined before it returns; a ref is what lets the loop close.
  const startListening = useRef<() => void>(() => {});
  const interruption = useRef<ActivityMonitor | null>(null);
  const wantsInterruption = useRef(false);

  const ensureConversation = useCallback(async () => {
    if (conversationId.current) return conversationId.current;
    const res = await fetch("/api/conversations", { method: "POST" });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(body?.error || `HTTP ${res.status}`);
    }
    const { id } = (await res.json()) as { id: string };
    conversationId.current = id;
    return id;
  }, []);

  /**
   * Speaking over the reply takes the turn back.
   *
   * Armed from the moment sound actually starts rather than the moment the
   * reply was requested: echo cancellation has nothing to cancel until the
   * speaker is going, and a watch armed early would hear the first words of
   * the reply and treat them as an interruption of itself.
   */
  const armInterruption = useCallback(() => {
    wantsInterruption.current = true;
    void watchForInterruption(() => {
      if (!wantsInterruption.current || !conversing.current) return;
      stopSpeaking();
      setReply("");
      setPhase("listening");
      startListening.current();
    }).then((monitor) => {
      // The reply may have finished while the microphone was still opening.
      if (!monitor) return;
      if (wantsInterruption.current) interruption.current = monitor;
      else monitor.stop();
    });
  }, []);

  const handleFinal = useCallback(
    async (text: string) => {
      setHeard(text);
      setReply("");
      setError(null);
      setPhase("thinking");

      try {
        const id = await ensureConversation();
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversationId: id, content: text }),
        });
        if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
        const answer = await res.text();

        // Stopped while this was in flight: the turn is still saved, but
        // speaking it now would be answering a question already abandoned.
        if (!conversing.current) {
          setPhase("idle");
          return;
        }

        setReply(answer);
        setPhase("speaking");
        speak(answer, {
          onStart: armInterruption,
          onEnd: () => {
            if (!conversing.current) return setPhase("idle");
            setPhase("listening");
            startListening.current();
          },
        });
      } catch (err) {
        console.error("Voice turn failed:", err);
        conversing.current = false;
        releaseMicrophone();
        setError(FAILED);
        setPhase("idle");
      }
    },
    [ensureConversation, armInterruption]
  );

  const handleSilence = useCallback(() => {
    conversing.current = false;
    releaseMicrophone();
    setPhase("idle");
  }, []);

  const speech = useSpeechInput(handleFinal, { onSilence: handleSilence });

  useEffect(() => {
    startListening.current = speech.start;
  }, [speech.start]);

  // Leaving the page mid-reply would otherwise keep talking to an empty room
  // with the microphone still lit.
  useEffect(
    () => () => {
      stopSpeaking();
      releaseMicrophone();
    },
    []
  );

  const begin = useCallback((first?: string) => {
    conversing.current = true;
    setError(null);
    setReply("");
    if (first) {
      void handleFinal(first);
      return;
    }
    setHeard("");
    setPhase("listening");
    startListening.current();
  }, [handleFinal]);

  /**
   * Listening for its own name, which only happens while nothing else is:
   * during a turn the microphone belongs to that turn, and a second
   * recognition would take the first one's input away.
   */
  const waiting = speech.supported && wakeEnabled && phase === "idle";

  useEffect(() => {
    if (!waiting) return;
    const listener = startWakeListening({
      onWake: (rest) => begin(rest || undefined),
      onError: (message) => {
        // A microphone that won't open can't be waited on; saying so and
        // switching the setting off beats a screen that claims to be
        // listening for a name it will never hear.
        setError(message);
        setWakeEnabled(false);
      },
    });
    return () => listener.stop();
  }, [waiting, begin, setWakeEnabled]);

  // Whatever ends the reply — finishing, being interrupted, being stopped —
  // ends with a phase that isn't "speaking", so this is the one place that
  // has to remember to close the watch.
  useEffect(() => {
    if (phase === "speaking") return;
    wantsInterruption.current = false;
    interruption.current?.stop();
    interruption.current = null;
  }, [phase]);

  const toggle = useCallback(() => {
    if (conversing.current) {
      conversing.current = false;
      speech.stop();
      stopSpeaking();
      releaseMicrophone();
      setPhase("idle");
      return;
    }
    begin();
  }, [speech, begin]);

  return {
    supported: speech.supported,
    phase,
    waiting,
    // While listening the subtitle should be the words as they are
    // recognised; once the turn is sent it settles on what was actually heard.
    heard: phase === "listening" ? speech.transcript : heard,
    reply,
    error: error ?? speech.error,
    toggle,
    wakeEnabled,
    setWakeEnabled,
  };
}
