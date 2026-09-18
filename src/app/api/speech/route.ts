import { MAX_SPEECH_CHARS, isElevenLabsConfigured, synthesizeSpeech } from "@/lib/integrations/elevenlabs";

/**
 * Reads text aloud in the configured ElevenLabs voice.
 *
 * The key stays here: handing it to the browser would put a metered account
 * behind a URL anyone could read out of devtools. This route sits behind the
 * same passcode gate as everything else (see src/proxy.ts), which is what
 * stops a stranger with the URL from spending the quota.
 *
 * A 503 means "no voice configured", and the caller is expected to fall back
 * to the browser's own speech synthesis rather than treat it as an error —
 * the app has to keep talking when ElevenLabs isn't set up or has run out.
 */
export async function POST(request: Request) {
  if (!isElevenLabsConfigured()) {
    return Response.json({ error: "ElevenLabs is not configured." }, { status: 503 });
  }

  let text: unknown;
  try {
    ({ text } = (await request.json()) as { text?: unknown });
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (typeof text !== "string" || !text.trim()) {
    return Response.json({ error: "text is required." }, { status: 400 });
  }

  try {
    const upstream = await synthesizeSpeech(text.trim());
    return new Response(upstream.body, {
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "audio/mpeg",
        // Generated per reply and never reused; caching it would only risk
        // one answer being spoken in place of another.
        "Cache-Control": "no-store",
        "X-Speech-Truncated": text.trim().length > MAX_SPEECH_CHARS ? "1" : "0",
      },
    });
  } catch (err) {
    console.error("Speech synthesis failed:", err);
    // Also a signal to fall back: a voice that fails is no reason for the
    // conversation to stop.
    return Response.json({ error: "Speech synthesis failed." }, { status: 502 });
  }
}
