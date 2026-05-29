import { useTimeline } from "@/stores/timelineStore";
import type {
  Subsystem,
  TimelineLevel,
  TimelineApiInfo,
} from "@/stores/timelineStore";

/**
 * Diagnostic logging helpers. Thin sugar over `useTimeline.append` that
 * standardizes the shape of API-call trace events (subsystem, endpoint,
 * timing, status, byte sizes) so every instrumented call site reads the same.
 *
 * Cycle-safe: this only imports the timeline store, which imports no services.
 * Services (gemini/kindroid/elevenlabs/places/...) import THIS — never the
 * other way around — so there's no import cycle.
 *
 * Trace events default to `level: "debug"`, which the Session Timeline's
 * "Activity" filter hides; switch the filter to "Full trace" to see them.
 */

const ICON_BY_SUBSYSTEM: Record<Subsystem, string> = {
  gemini: "✨",
  kindroid: "📡",
  elevenlabs: "🔊",
  "image-server": "⬆️",
  places: "🗺️",
  weather: "🌤️",
  location: "📍",
  obsidian: "📓",
  audio: "🎚️",
  session: "▶",
  chat: "💬",
  mode: "🎛️",
};

export function iconForSubsystem(s: Subsystem): string {
  return ICON_BY_SUBSYSTEM[s] ?? "🔧";
}

export interface LogApiCallInput {
  subsystem: Subsystem;
  /** Short headline, e.g. "Emote assembled" or "POST /send-message". */
  label: string;
  method?: string;
  endpoint?: string;
  status?: number;
  durationMs?: number;
  requestBytes?: number;
  responseBytes?: number;
  detail?: string;
  meta?: Record<string, unknown>;
  /** Defaults to "debug" — the per-call trace level. */
  level?: TimelineLevel;
  /** Overrides the per-subsystem default icon. */
  icon?: string;
}

/** Append a single trace event. */
export function logApiCall(input: LogApiCallInput): void {
  const api: TimelineApiInfo = {
    method: input.method,
    endpoint: input.endpoint,
    status: input.status,
    durationMs: input.durationMs,
    requestBytes: input.requestBytes,
    responseBytes: input.responseBytes,
  };
  const hasApi = Object.values(api).some((v) => v !== undefined);
  useTimeline.getState().append({
    kind: "api-call",
    level: input.level ?? "debug",
    subsystem: input.subsystem,
    icon: input.icon ?? iconForSubsystem(input.subsystem),
    label: input.label,
    detail: input.detail,
    durationMs: input.durationMs,
    api: hasApi ? api : undefined,
    meta: input.meta,
  });
}

/**
 * Drop-in `fetch` replacement that logs a trace event with method, redacted
 * endpoint, HTTP status, duration, and byte sizes. Pass `label` in `init` to
 * override the auto-generated "METHOD /path" headline. The response body is
 * NOT consumed here (the caller still reads it); responseBytes comes from the
 * Content-Length header when present.
 */
export async function tracedFetch(
  subsystem: Subsystem,
  input: string,
  init: RequestInit & { label?: string } = {}
): Promise<Response> {
  const start = Date.now();
  const method = (init.method ?? "GET").toUpperCase();
  const endpoint = redactUrl(input);
  const requestBytes = byteLength(init.body);
  const label = init.label ?? `${method} ${pathOf(endpoint)}`;
  try {
    const res = await fetch(input, init);
    const cl = res.headers.get("content-length");
    logApiCall({
      subsystem,
      label,
      method,
      endpoint,
      status: res.status,
      durationMs: Date.now() - start,
      requestBytes,
      responseBytes: cl != null ? Number(cl) : undefined,
      level: res.ok ? "debug" : "error",
    });
    return res;
  } catch (err) {
    logApiCall({
      subsystem,
      label,
      method,
      endpoint,
      durationMs: Date.now() - start,
      requestBytes,
      level: isAbort(err) ? "debug" : "error",
      detail: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

function isAbort(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { name?: string }).name === "AbortError"
  );
}

/** Approximate byte size of a fetch body for the request-size field. */
function byteLength(body: BodyInit | null | undefined): number | undefined {
  if (body == null) return undefined;
  if (typeof body === "string") return body.length;
  if (body instanceof Uint8Array) return body.byteLength;
  if (body instanceof ArrayBuffer) return body.byteLength;
  return undefined;
}

/** Strip the path off a URL for a compact headline. */
function pathOf(url: string): string {
  const m = url.match(/^https?:\/\/[^/]+(\/[^?]*)?/);
  return m?.[1] ?? url;
}

/**
 * Redact secrets from a URL before logging. API keys ride in query params for
 * the Google/OpenWeather endpoints; we never want those in the timeline or the
 * Obsidian export even though everything else is logged at full fidelity.
 */
export function redactUrl(url: string): string {
  return url.replace(
    /([?&](?:key|appid|token|api_?key)=)[^&]+/gi,
    "$1[redacted]"
  );
}
