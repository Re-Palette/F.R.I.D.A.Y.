"use client";

/**
 * Noticing that someone has started talking while the reply is still going.
 *
 * Waiting for a sentence to finish before you can say anything is the thing
 * that makes talking to a machine feel like operating one. So while the
 * reply plays, the microphone level is watched, and speech over the top of
 * it cuts the reply short and hands the turn back.
 *
 * The obvious way to do this — run speech recognition during playback — is
 * the one that cannot work: the microphone hears the reply coming out of
 * the speaker and the reply interrupts itself, forever. What makes this
 * viable is asking for the microphone with echoCancellation, which is the
 * browser subtracting its own output from what it hears. Automatic gain is
 * declined for the opposite reason: it would quietly amplify a silent room
 * until the room crossed the threshold.
 *
 * It is a level detector, not a speech detector — a slammed door will do
 * it. That is the right way round: interrupting a machine that is talking
 * costs a sentence you can ask for again, while failing to interrupt it is
 * the problem being fixed.
 */

/**
 * Root-mean-square over a frame. Speech at a laptop or phone microphone sits
 * an order of magnitude above a quiet room; this sits between them, high
 * enough that breathing and fan noise don't reach it.
 */
const SPEECH_LEVEL = 0.04;

/** How long the level has to hold up. Long enough to rule out a cough or a
 *  keystroke, short enough that the reply stops while you are still on your
 *  first word. */
const SUSTAINED_MS = 280;

/** Echo cancellation needs a moment to converge on the sound it is removing,
 *  and until it has, the reply can hear itself. */
const ARM_DELAY_MS = 500;

export interface ActivityMonitor {
  stop: () => void;
}

let shared: { stream: MediaStream; context: AudioContext } | null = null;

async function open(): Promise<{ stream: MediaStream; context: AudioContext }> {
  if (shared) return shared;

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false },
  });
  const context = new AudioContext();
  if (context.state === "suspended") await context.resume();

  shared = { stream, context };
  return shared;
}

/**
 * Gives the microphone back.
 *
 * Worth doing rather than leaving the stream open between replies: an open
 * stream is a lit indicator on the device, and a machine that shows it is
 * listening when it isn't is not one anybody should be asked to trust.
 */
export function releaseMicrophone() {
  if (!shared) return;
  shared.stream.getTracks().forEach((track) => track.stop());
  void shared.context.close().catch(() => {});
  shared = null;
}

/**
 * Watches for someone speaking over the reply, calling `onSpeech` once.
 *
 * Resolves to null when the microphone isn't available — a refused
 * permission means no interrupting, not a broken conversation.
 */
export async function watchForInterruption(onSpeech: () => void): Promise<ActivityMonitor | null> {
  let cancelled = false;
  let frame = 0;

  const monitor: ActivityMonitor = {
    stop() {
      cancelled = true;
      if (frame) cancelAnimationFrame(frame);
    },
  };

  let opened: { stream: MediaStream; context: AudioContext };
  try {
    opened = await open();
  } catch (err) {
    console.error("Microphone unavailable for interruption:", err);
    return null;
  }
  if (cancelled) return monitor;

  const analyser = opened.context.createAnalyser();
  analyser.fftSize = 1024;
  opened.context.createMediaStreamSource(opened.stream).connect(analyser);

  const samples = new Float32Array(analyser.fftSize);
  const armAt = performance.now() + ARM_DELAY_MS;
  let speakingSince = 0;

  const tick = () => {
    if (cancelled) return;

    analyser.getFloatTimeDomainData(samples);
    let sum = 0;
    for (const sample of samples) sum += sample * sample;
    const level = Math.sqrt(sum / samples.length);

    const now = performance.now();
    if (now < armAt) {
      frame = requestAnimationFrame(tick);
      return;
    }

    if (level < SPEECH_LEVEL) {
      speakingSince = 0;
    } else {
      if (!speakingSince) speakingSince = now;
      if (now - speakingSince >= SUSTAINED_MS) {
        cancelled = true;
        onSpeech();
        return;
      }
    }

    frame = requestAnimationFrame(tick);
  };

  frame = requestAnimationFrame(tick);
  return monitor;
}
