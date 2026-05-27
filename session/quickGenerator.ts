import type { SensorSnapshot } from "@/types";
import { generateQuickMessages } from "@/services/gemini";
import { snapshotToText } from "./sensorStub";
import { useQuick } from "@/stores/quickStore";
import { useChat } from "@/stores/chatStore";
import { useMode } from "@/stores/modeStore";

/**
 * Quick Messages generation orchestration. Called from the session poller on
 * every tick; this module decides whether the current sensor snapshot
 * warrants a fresh batch of suggestions and fires the Gemini call when so.
 *
 * Refresh triggers:
 *   - First entry into Conversation Mode (suggestions empty)
 *   - Resolved place name changed since last batch
 *   - Weather bucket changed (clear ↔ rain/snow ↔ storm)
 *   - >2 km moved since last batch
 *   - Manual refresh (future — View All "refresh now" button)
 *
 * Suppressors (no regen even if a trigger fires):
 *   - Not in Conversation Mode (no point generating cards Tim won't see)
 *   - A generation call is already in flight
 *   - Less than QUICK_REGEN_COOLDOWN_MS since the last successful batch
 */

const QUICK_REGEN_COOLDOWN_MS = 90_000; // 90s minimum between regens
const QUICK_MOVE_THRESHOLD_M = 2_000; // 2km warrants a fresh batch
const TARGET_BATCH_SIZE = 16;

// ── Fingerprint helpers ─────────────────────────────────────────

/**
 * Compress the current snapshot into a short string used to skip regen when
 * effectively nothing has changed. Place name + weather bucket + km-rounded
 * coordinates is a good signal — small moves and reading drift don't
 * trip a refresh, but a real change in any field does.
 */
function fingerprint(snapshot: SensorSnapshot): string {
  const loc = snapshot.location;
  const place = loc?.placeName ?? "unknown";
  const kmLat = loc ? Math.round(loc.latitude * 100) / 100 : "?"; // ~1km granularity
  const kmLon = loc ? Math.round(loc.longitude * 100) / 100 : "?";
  const bucket = weatherBucket(snapshot.weather?.conditions);
  const activity = snapshot.activity ?? "?";
  return `${place}|${kmLat},${kmLon}|${bucket}|${activity}`;
}

function weatherBucket(conditions?: string): string {
  if (!conditions) return "unknown";
  const c = conditions.toLowerCase();
  if (c.includes("thunder") || c.includes("storm")) return "storm";
  if (c.includes("snow") || c.includes("sleet") || c.includes("ice")) return "snow";
  if (c.includes("rain") || c.includes("drizzle") || c.includes("shower")) return "rain";
  if (c.includes("fog") || c.includes("mist") || c.includes("haze")) return "fog";
  if (c.includes("cloud")) return "cloud";
  if (c.includes("clear") || c.includes("sun")) return "clear";
  return "other";
}

function distanceM(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number }
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// ── Last-anchor cache ───────────────────────────────────────────
//
// Track the lat/lon of the snapshot that produced the last batch so we can
// compute "have we moved >2km" cheaply on every tick.

let lastAnchorLat: number | null = null;
let lastAnchorLon: number | null = null;

export function resetQuickAnchor(): void {
  lastAnchorLat = null;
  lastAnchorLon = null;
}

// ── Main entry ──────────────────────────────────────────────────

/**
 * Called from the session poller. Cheap fast-path checks first; only fires
 * the Gemini call when a refresh is actually warranted.
 */
export function maybeRefreshQuickMessages(snapshot: SensorSnapshot): void {
  const inConversation = useMode.getState().conversation;
  if (!inConversation) return; // suppress entirely when overlay isn't visible

  const q = useQuick.getState();
  if (q.generating) return;

  const now = Date.now();
  const sinceLast = q.generatedAt ? now - q.generatedAt : Infinity;

  // Refresh-trigger logic. ANY of these warrants a regen:
  const fp = fingerprint(snapshot);
  const fingerprintChanged = q.contextFingerprint !== fp;
  const cardsLow = q.suggestions.length < 4;
  const emptyBatch = q.suggestions.length === 0;

  let movedFar = false;
  const loc = snapshot.location;
  if (loc && lastAnchorLat !== null && lastAnchorLon !== null) {
    const d = distanceM(
      { latitude: lastAnchorLat, longitude: lastAnchorLon },
      { latitude: loc.latitude, longitude: loc.longitude }
    );
    movedFar = d >= QUICK_MOVE_THRESHOLD_M;
  }

  const shouldRefresh =
    emptyBatch || (sinceLast >= QUICK_REGEN_COOLDOWN_MS && (fingerprintChanged || movedFar || cardsLow));
  if (!shouldRefresh) return;

  // Fire the Gemini call. Fire-and-forget; the store mediates the result.
  void runGeneration(snapshot, fp);
}

async function runGeneration(snapshot: SensorSnapshot, fp: string): Promise<void> {
  const q = useQuick.getState();
  q.setGenerating(true);
  try {
    const snapshotText = snapshotToText(snapshot);
    const history = buildHistorySnippet();
    const batch = await generateQuickMessages({
      sensorSnapshot: snapshotText,
      history,
      count: TARGET_BATCH_SIZE,
    });
    useQuick.getState().setSuggestions(batch, fp);
    if (snapshot.location) {
      lastAnchorLat = snapshot.location.latitude;
      lastAnchorLon = snapshot.location.longitude;
    }
    console.log(`[quickGen] batch of ${batch.length} suggestions ready (fp=${fp})`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[quickGen] generation failed:", msg);
    useQuick.getState().setError(msg);
  }
}

/**
 * Build a compact history snippet for the generator so Gemini doesn't
 * suggest topics Tim or Eli just covered. We only send the last 6 turns —
 * the full chat history would be wasteful here.
 */
function buildHistorySnippet(): import("@google/generative-ai").Content[] {
  const messages = useChat.getState().messages;
  const recent = messages.slice(-6);
  return recent
    .filter((m) => m.from === "tim" || m.from === "eli")
    .map((m) => ({
      role: m.from === "tim" ? "user" : "model",
      parts: [{ text: m.raw ?? (m.emote ? `_(*${m.emote}*)_ ${m.dialog}` : m.dialog) }],
    }));
}
