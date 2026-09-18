const API_BASE = "https://api.elevenlabs.io/v1";

/**
 * Flash is the low-latency model — ElevenLabs quote sub-100ms for it, against
 * roughly half a second for the multilingual model. In a spoken conversation
 * that difference is the gap between an answer and a pause, and the loss in
 * expressiveness is not audible in a two-sentence reply. Override it with
 * ELEVENLABS_MODEL_ID if a particular voice is worth the wait.
 */
const DEFAULT_MODEL = "eleven_flash_v2_5";
const DEFAULT_FORMAT = "mp3_44100_128";

/**
 * ElevenLabs bills per character, so an agent that decides to read out a long
 * document would spend real money doing it. The subtitle shows the whole
 * reply either way — this only bounds what is read aloud.
 */
export const MAX_SPEECH_CHARS = 1200;

export function isElevenLabsConfigured(): boolean {
  return Boolean(process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_VOICE_ID);
}

/**
 * Turns text into speech in the configured voice, returning the upstream
 * response so its audio can be piped straight through without being buffered
 * on the server.
 *
 * Uses the streaming endpoint: it starts returning audio while the rest is
 * still being generated, which is most of the point of Flash.
 */
export async function synthesizeSpeech(text: string): Promise<Response> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;
  if (!apiKey || !voiceId) {
    throw new Error("ELEVENLABS_API_KEY / ELEVENLABS_VOICE_ID are not set. See .env.example.");
  }

  const url = `${API_BASE}/text-to-speech/${encodeURIComponent(voiceId)}/stream?output_format=${DEFAULT_FORMAT}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text: text.slice(0, MAX_SPEECH_CHARS),
      model_id: process.env.ELEVENLABS_MODEL_ID || DEFAULT_MODEL,
    }),
  });

  if (!res.ok || !res.body) {
    // The body is where ElevenLabs says what is actually wrong — an unknown
    // voice, a used-up quota, a key without the right permission. Dropping it
    // is what turns a five-second fix into an afternoon.
    const detail = await res.text().catch(() => "");
    throw new Error(`ElevenLabs ${res.status}: ${detail.slice(0, 500)}`);
  }

  return res;
}
