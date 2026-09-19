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
 * How far above the background a sound has to sit to count as someone
 * talking.
 *
 * This used to be a fixed level, and a fixed level cannot work: with
 * automatic gain declined the raw figure depends on the microphone, the
 * distance and the room, and the one that was here — 0.04 RMS — is above
 * where a normal speaking voice lands on a laptop at arm's length. So it
 * almost never fired, which is the bug this replaces.
 *
 * What is stable is the ratio. The background is tracked continuously —
 * quiet room, fans, and whatever of the reply survives echo cancellation —
 * and speech is what rises well clear of it.
 */
const OVER_BACKGROUND = 3.5;

/**
 * Below this it is never speech, however quiet the room is.
 *
 * Measured rather than guessed: an ordinary indoor voice at arm's length,
 * with automatic gain declined, lands around 0.01 RMS, and a floor set
 * above that is a floor nobody can cross by talking normally. What this has
 * to exclude is breathing and a keyboard, which sit under 0.003 — and a
 * keystroke is over long before the fifth of a second this also requires.
 */
const MIN_SPEECH = 0.004;

/** And above this it is never required, however loud the room is. */
const MAX_SPEECH = 0.16;

/**
 * How much speech has to accumulate before the reply is cut off. Long
 * enough to rule out a cough or a keystroke, short enough that the reply
 * stops while you are still on your first word.
 */
const SUSTAINED_MS = 200;

/**
 * How fast that accumulation drains while the level is back down.
 *
 * Speech is not continuous — there is a gap between syllables, and at the
 * frame rate this samples at, several of them fall below the threshold in
 * any ordinary sentence. Requiring an unbroken run above it, which is what
 * this did before, meant every one of those gaps reset the count and a
 * normal speaking voice never got there at all. Draining more slowly than
 * it fills is what lets a sentence add up while a single knock still fades
 * away.
 */
const DRAIN_RATE = 0.5;

/** Echo cancellation needs a moment to converge on the sound it is removing,
 *  and until it has, the reply can hear itself. The background is learned
 *  during this window rather than ignored. */
const ARM_DELAY_MS = 450;

/**
 * The background, as a level that falls to meet a quiet room quickly and
 * rises to meet a loud one slowly. Rising slowly is the point: someone
 * talking for a fifth of a second must not be absorbed into the background
 * before it has been noticed.
 */
function trackBackground(background: number, level: number): number {
  if (background === 0) return level;
  return level < background ? level * 0.15 + background * 0.85 : level * 0.004 + background * 0.996;
}

/**
 * The live input level, for anything that wants to show it.
 *
 * Published rather than returned because it changes sixty times a second:
 * a React state update at that rate would re-render the screen for every
 * frame of a waveform. Subscribers write it straight to the DOM.
 */
const levelListeners = new Set<(level: number) => void>();

export function subscribeToInputLevel(listener: (level: number) => void): () => void {
  levelListeners.add(listener);
  return () => {
    levelListeners.delete(listener);
  };
}

function publishLevel(level: number) {
  levelListeners.forEach((listener) => listener(level));
}

export interface ActivityMonitor {
  stop: () => void;
}

let shared: { stream: MediaStream; context: AudioContext } | null = null;

async function open(): Promise<{ stream: MediaStream; context: AudioContext }> {
  if (!shared) {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false },
    });
    shared = { stream, context: new AudioContext() };
  }

  // Resumed every time, not only when it is created. A context started
  // without a recent tap — which is every conversation begun by calling its
  // name — comes up suspended, and a suspended context produces silence
  // forever rather than an error, so the cached one has to be checked again
  // on each acquisition.
  if (shared.context.state === "suspended") {
    await shared.context.resume().catch((err) => {
      console.error("Audio context would not resume:", err);
    });
  }

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
      publishLevel(0);
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
  let background = 0;
  let voiced = 0;
  let lastAt = performance.now();

  const tick = () => {
    if (cancelled) return;

    analyser.getFloatTimeDomainData(samples);
    let sum = 0;
    for (const sample of samples) sum += sample * sample;
    const level = Math.sqrt(sum / samples.length);

    publishLevel(level);
    background = trackBackground(background, level);

    const now = performance.now();
    // Still learning the background — including whatever of the reply is
    // getting through — so nothing can trigger yet.
    if (now < armAt) {
      frame = requestAnimationFrame(tick);
      return;
    }

    const threshold = Math.min(MAX_SPEECH, Math.max(MIN_SPEECH, background * OVER_BACKGROUND));
    const elapsed = now - lastAt;
    lastAt = now;

    voiced = Math.max(0, voiced + (level >= threshold ? elapsed : -elapsed * DRAIN_RATE));
    if (voiced >= SUSTAINED_MS) {
      cancelled = true;
      onSpeech();
      return;
    }

    frame = requestAnimationFrame(tick);
  };

  frame = requestAnimationFrame(tick);
  return monitor;
}
