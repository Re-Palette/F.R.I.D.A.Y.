"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { speak, stopSpeaking, useSpeechInput } from "@/lib/speech";

export type VoicePhase = "idle" | "listening" | "thinking" | "speaking";

export interface VoiceConversation {
  /** False until hydration confirms the browser can listen. */
  supported: boolean;
  phase: VoicePhase;
  /** What was just said — live while listening, then kept for context. */
  heard: string;
  /** The reply, shown as a subtitle while it is read aloud. */
  reply: string;
  error: string | null;
  /** Starts the conversation, or ends it if one is already running. */
  toggle: () => void;
}

const FAILED = "応答を取得できませんでした。";

/**
 * A conversation held entirely out loud.
 *
 * The difference from a microphone button is that this doesn't stop after one
 * answer: when a reply finishes being spoken it listens again, so turns follow
 * each other the way they do in a conversation. It ends when the user says
 * nothing, or when they touch the control — silence is the natural way to stop
 * talking to something, and leaving the microphone open past it would be a
 * different thing than what was consented to.
 *
 * Nothing about what is stored changes: every turn still goes through
 * /api/chat into the same conversation row, so the history screens see exactly
 * what typing would have produced.
 */
export function useVoiceConversation(): VoiceConversation {
  const [phase, setPhase] = useState<VoicePhase>("idle");
  const [heard, setHeard] = useState("");
  const [reply, setReply] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Every turn joins the same conversation, created on the first one.
  const conversationId = useRef<string | null>(null);
  // Distinguishes "the reply finished, so listen again" from "the user ended
  // it", which must not restart — and lets a reply that arrives after the
  // user has stopped be discarded rather than spoken at them.
  const conversing = useRef(false);
  // `start` is needed inside the handler that `useSpeechInput` is given, which
  // is defined before it returns; a ref is what lets the loop close.
  const startListening = useRef<() => void>(() => {});

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
          onEnd: () => {
            if (!conversing.current) return setPhase("idle");
            setPhase("listening");
            startListening.current();
          },
        });
      } catch (err) {
        console.error("Voice turn failed:", err);
        conversing.current = false;
        setError(FAILED);
        setPhase("idle");
      }
    },
    [ensureConversation]
  );

  const handleSilence = useCallback(() => {
    conversing.current = false;
    setPhase("idle");
  }, []);

  const speech = useSpeechInput(handleFinal, { onSilence: handleSilence });

  useEffect(() => {
    startListening.current = speech.start;
  }, [speech.start]);

  // Leaving the page mid-reply would otherwise keep talking to an empty room.
  useEffect(() => () => stopSpeaking(), []);

  const toggle = useCallback(() => {
    if (conversing.current) {
      conversing.current = false;
      speech.stop();
      stopSpeaking();
      setPhase("idle");
      return;
    }
    conversing.current = true;
    setHeard("");
    setReply("");
    setError(null);
    setPhase("listening");
    speech.start();
  }, [speech]);

  return {
    supported: speech.supported,
    phase,
    // While listening the subtitle should be the words as they are recognised;
    // once the turn is sent it settles on what was actually heard.
    heard: phase === "listening" ? speech.transcript : heard,
    reply,
    error: error ?? speech.error,
    toggle,
  };
}
