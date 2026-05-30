import { File, Paths } from "expo-file-system";
import { requireEnv } from "./env";
import { currentAbortSignal } from "@/session/abortBus";
import { logApiCall } from "@/session/diagnosticLog";

const BASE_URL = "https://api.elevenlabs.io/v1";

// Timeout design notes — UPDATED based on field-captured trace data:
//
// Every successful synth in production shows `mode=buffered`, `chunks=1`,
// `firstChunkMs=null`. That means React Native's `fetch` on this build does
// NOT support streaming response bodies — it buffers the entire MP3 before
// `await fetch()` resolves. So the timer we *called* "first byte" is really
// measuring **total time to download the whole response**, and there's no
// real "headers vs body" split to guard separately.
//
// For eleven_v3 in buffered mode, generation scales with text length at
// roughly 25–40 ms/char. A ~1100-char reply averages ~30s but ElevenLabs'
// server-side variance occasionally pushes a single synth past 90s. At the
// old 90s wall, those legitimate-but-slow generations got cut off and
// surfaced as "TTS synthesis failed" even though the request was healthy.
//
// FIRST_BYTE_TIMEOUT_MS  — kept structurally for the case where RN ever DOES
//                          stream the body (unchanged code path); in buffered
//                          mode it co-fires with HARD_CAP_MS so neither limits
//                          us prematurely. Set equal to the hard cap.
// STALL_TIMEOUT_MS       — only meaningful in streaming mode (per-chunk gap).
//                          Inert in buffered mode; left for when streaming
//                          becomes available on the platform.
// HARD_CAP_MS            — the ONE wall that matters in buffered mode. Sized
//                          for v3's worst-case generation: 4 minutes covers
//                          even outlier long replies. Anything longer is
//                          genuinely pathological and the recovery popup is
//                          the right escape hatch.
const HARD_CAP_MS = 240_000;
const FIRST_BYTE_TIMEOUT_MS = HARD_CAP_MS;
const STALL_TIMEOUT_MS = 20_000;

// 64kbps is roughly half the data of 128kbps for basically identical quality
// through a car speaker (or any single-speaker playback). Cuts transfer time
// proportionally on bandwidth-constrained links.
const DEFAULT_MODEL = "eleven_v3";
const DEFAULT_FORMAT = "mp3_44100_64";

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
 * app's cache directory. Returns the local file URI.
 *
 * Uses ElevenLabs' streaming endpoint (`/stream`) and progressively reads
 * the response body chunk-by-chunk via `res.body.getReader()`. The streaming
 * endpoint has much lower time-to-first-byte than the buffered endpoint —
 * crucial on cellular where the connection genuinely IS slow but functional.
 *
 * If RN's fetch implementation can't yield response body chunks (some
 * Hermes/Android configs buffer the whole response before exposing the
 * reader), the code degrades gracefully: it just gets one giant final chunk
 * and writes that, equivalent to the old buffered behavior, gated by the
 * same first-byte + hard-cap timeouts.
 */
export async function synthesizeToFile(
  text: string,
  cacheKey: string,
  options: SynthesizeOptions = {}
): Promise<string> {
  const apiKey = requireEnv("ELEVENLABS_API_KEY");
  const voiceId = requireEnv("ELEVENLABS_VOICE_ID");

  const url =
    `${BASE_URL}/text-to-speech/${encodeURIComponent(voiceId)}/stream` +
    `?output_format=${DEFAULT_FORMAT}`;
  const body = {
    text,
    model_id: options.model ?? DEFAULT_MODEL,
    voice_settings: { ...DEFAULT_VOICE_SETTINGS, ...options.voiceSettings },
  };

  const ctl = new AbortController();
  const startTime = Date.now();

  // Wire the global abort bus so the ⏹ button kills synth mid-stream. The
  // local controller still owns the three timeout legs below; this just adds
  // a fourth abort trigger driven by the user.
  const busSignal = currentAbortSignal();
  const onBusAbort = () => ctl.abort();
  if (busSignal.aborted) ctl.abort();
  else busSignal.addEventListener("abort", onBusAbort, { once: true });

  // Coordinated timeout state:
  //   - firstByteTimer fires if no response arrives at all
  //   - hardCapTimer fires unconditionally as the sanity backstop
  //   - stallTimer is created/refreshed once we start reading chunks
  let firstByteTimer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
    ctl.abort();
  }, FIRST_BYTE_TIMEOUT_MS);
  const hardCapTimer = setTimeout(() => {
    ctl.abort();
  }, HARD_CAP_MS);
  let stallTimer: ReturnType<typeof setTimeout> | null = null;

  const clearAll = () => {
    if (firstByteTimer) clearTimeout(firstByteTimer);
    if (stallTimer) clearTimeout(stallTimer);
    clearTimeout(hardCapTimer);
    busSignal.removeEventListener("abort", onBusAbort);
    firstByteTimer = null;
    stallTimer = null;
  };

  const isAbortError = (err: unknown): boolean =>
    (err instanceof Error && err.name === "AbortError") ||
    (typeof err === "object" &&
      err !== null &&
      (err as { name?: string }).name === "AbortError");

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
    clearAll();
    if (isAbortError(err)) {
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      throw new Error(
        `ElevenLabs synth aborted before response (${elapsed}s elapsed)`
      );
    }
    throw err;
  }

  // Got headers back — clear the first-byte timer; chunk-stall takes over.
  const headersAtMs = Date.now() - startTime;
  if (firstByteTimer) {
    clearTimeout(firstByteTimer);
    firstByteTimer = null;
  }

  if (!res.ok) {
    clearAll();
    const errText = await res.text().catch(() => "(no body)");
    throw new Error(
      `ElevenLabs synth → HTTP ${res.status}: ${errText.slice(0, 200)}`
    );
  }

  // Collect chunks. If res.body is a readable stream, we read it
  // progressively and refresh the stall timer on every chunk. If it isn't
  // (RN/Hermes may buffer the whole response), we fall back to arrayBuffer.
  const chunks: Uint8Array[] = [];
  const reader = (res.body as ReadableStream<Uint8Array> | null)?.getReader?.();
  // Diagnostic: did fetch resolve at HTTP headers (streaming) or only after the
  // whole body buffered? This is THE number that tells us whether a slow synth
  // is a clogged pipe (headers slow → wedging) or genuine generate-time
  // (buffered → v3 is just slow). Grep `[elevenlabs]` in logcat.
  console.log(
    `[elevenlabs] headers in ${headersAtMs}ms · mode=${reader ? "streaming" : "buffered"}`
  );
  let firstChunkAtMs: number | undefined;
  try {
    if (reader) {
      // Initial stall timer — bytes should start arriving within
      // STALL_TIMEOUT_MS or we treat it as dead.
      stallTimer = setTimeout(() => ctl.abort(), STALL_TIMEOUT_MS);
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value && value.length > 0) {
          if (firstChunkAtMs === undefined) {
            firstChunkAtMs = Date.now() - startTime;
            console.log(`[elevenlabs] first audio chunk at ${firstChunkAtMs}ms`);
          }
          chunks.push(value);
          // Reset the stall timer — we just got data, the connection's alive.
          if (stallTimer) clearTimeout(stallTimer);
          stallTimer = setTimeout(() => ctl.abort(), STALL_TIMEOUT_MS);
        }
      }
    } else {
      // Streaming reader unavailable on this RN config — fall back to the
      // buffered path. The hard-cap timer is still arming our abort.
      const buf = await res.arrayBuffer();
      chunks.push(new Uint8Array(buf));
    }
  } catch (err) {
    clearAll();
    // Explicitly release the stream. An aborted fetch whose reader is just
    // abandoned can leave the underlying HTTP connection half-read in the
    // Android (OkHttp) pool; cancel() returns it cleanly so repeated synth
    // failures don't exhaust the per-host connection limit.
    try {
      await reader?.cancel();
    } catch {
      // reader already errored/closed — release is best-effort
    }
    if (isAbortError(err)) {
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      const reason =
        chunks.length === 0
          ? "no bytes received"
          : `stalled after ${chunks.length} chunks`;
      throw new Error(
        `ElevenLabs synth aborted at ${elapsed}s — ${reason}`
      );
    }
    throw err;
  }

  clearAll();

  if (chunks.length === 0) {
    throw new Error("ElevenLabs synth returned no audio data");
  }

  // Concatenate all chunks into one buffer for the file write. (Future
  // optimization: write each chunk to the file as it arrives, letting the
  // player start before download completes — that's the "true progressive
  // playback" lift, deferred.)
  const totalBytes = chunks.reduce((sum, c) => sum + c.length, 0);
  const merged = new Uint8Array(totalBytes);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.length;
  }

  const filename = `eli-${cacheKey}.mp3`;
  const file = new File(Paths.cache, filename);
  try {
    file.delete();
  } catch {
    // file didn't exist
  }
  file.create();
  file.write(merged);

  const totalMs = Date.now() - startTime;
  const elapsedSec = Math.round(totalMs / 1000);
  const sizeKB = Math.round(totalBytes / 1024);
  console.log(
    `[elevenlabs] synth ok: ${sizeKB}KB in ${elapsedSec}s (${chunks.length} chunks)`
  );

  // Timeline trace — the headers/first-chunk/mode timing is exactly the data
  // that distinguishes "v3 is slow" (buffered, high total time) from "pipe is
  // clogged" (streaming, slow headers). Tap this row in the Session Timeline
  // to see it. `meta` carries the full breakdown; `detail` is the one-liner.
  logApiCall({
    subsystem: "elevenlabs",
    label: "Synth ok",
    method: "POST",
    endpoint: `/text-to-speech/{voice}/stream?model=${body.model_id}`,
    status: 200,
    durationMs: totalMs,
    requestBytes: body.text.length,
    responseBytes: totalBytes,
    detail: `${sizeKB}KB · ${elapsedSec}s · ${reader ? "streaming" : "buffered"} · ${chunks.length} chunk${chunks.length === 1 ? "" : "s"}`,
    meta: {
      model: body.model_id,
      format: DEFAULT_FORMAT,
      mode: reader ? "streaming" : "buffered",
      headersMs: headersAtMs,
      firstChunkMs: firstChunkAtMs ?? null,
      totalMs,
      totalBytes,
      chunks: chunks.length,
      textLength: body.text.length,
    },
  });

  return file.uri;
}
