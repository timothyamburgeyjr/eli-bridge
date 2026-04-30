import { File, Paths } from "expo-file-system";
import { requireEnv } from "./env";

const BASE_URL = "https://api.elevenlabs.io/v1";

// Hard cap on a single synthesis fetch. ElevenLabs flash typically returns
// in <2s for short Eli replies; 30s is generous headroom that still lets a
// cellular dead-zone hang surface as a real error rather than locking the
// audio pipeline. AudioStore catches the throw and clears currentMessageId
// so Drive Mode's overlay unsticks.
const SYNTHESIS_TIMEOUT_MS = 30_000;

// Default to eleven_v3 — the only current ElevenLabs model that interprets
// audio tags like [laughs] / [sighs] / [whispers] as paralinguistic cues rather
// than literal words. Also the most expressive model overall. Latency is a bit
// higher than turbo (~1-2s); that's fine because playback is always manual
// (user taps ▶) so it's never blocking conversation flow.
const DEFAULT_MODEL = "eleven_v3";
const DEFAULT_FORMAT = "mp3_44100_128";

const DEFAULT_VOICE_SETTINGS = {
  stability: 0.45,
  similarity_boost: 0.75,
  style: 0.4,
  use_speaker_boost: true,
};

export interface SynthesizeOptions {
  model?: string;
  voiceSettings?: Partial<typeof DEFAULT_VOICE_SETTINGS>;
}

/**
 * Synthesize spoken audio for `text` via ElevenLabs and write the MP3 to the
 * app's cache directory. Returns the local file URI. Caller is responsible for
 * caching / deduping — this always performs a fresh synthesis.
 */
export async function synthesizeToFile(
  text: string,
  cacheKey: string,
  options: SynthesizeOptions = {}
): Promise<string> {
  const apiKey = requireEnv("ELEVENLABS_API_KEY");
  const voiceId = requireEnv("ELEVENLABS_VOICE_ID");

  const url = `${BASE_URL}/text-to-speech/${encodeURIComponent(voiceId)}?output_format=${DEFAULT_FORMAT}`;
  const body = {
    text,
    model_id: options.model ?? DEFAULT_MODEL,
    voice_settings: { ...DEFAULT_VOICE_SETTINGS, ...options.voiceSettings },
  };

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), SYNTHESIS_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify(body),
      signal: ctl.signal,
    });
  } catch (err) {
    if (
      err instanceof DOMException && err.name === "AbortError" ||
      (err instanceof Error && err.name === "AbortError")
    ) {
      throw new Error(
        `ElevenLabs synth timed out after ${SYNTHESIS_TIMEOUT_MS / 1000}s`
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "(no body)");
    throw new Error(`ElevenLabs synth → HTTP ${res.status}: ${errText.slice(0, 200)}`);
  }

  const buffer = await res.arrayBuffer();
  const filename = `eli-${cacheKey}.mp3`;
  const file = new File(Paths.cache, filename);
  // Overwrite any existing file with the same key
  try {
    file.delete();
  } catch {
    // file didn't exist
  }
  file.create();
  file.write(new Uint8Array(buffer));
  return file.uri;
}
