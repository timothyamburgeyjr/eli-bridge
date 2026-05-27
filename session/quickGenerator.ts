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

// Refresh-pacing tuning. The original numbers (90s / 2km) generated too
// often on cellular highway drives — at 65mph the movement trigger fired
// roughly every two minutes, and combined with place-name and weather
// triggers we landed ~15 calls/hr. The looser values below pace the
// refreshes closer to "every meaningful context shift" rather than "every
// time you've moved a little":
//   - 120s cooldown: caps worst-case burst when place names rapidly change
//   - 5km movement: at highway speed this is ~4.6 min between fires,
//     about 60% fewer movement-driven refreshes than 2km.
const QUICK_REGEN_COOLDOWN_MS = 120_000; // 2 min minimum between regens
const QUICK_MOVE_THRESHOLD_M = 5_000; // 5km warrants a fresh batch
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
  const q = useQuick.getState();
  // Suppress when nobody is looking at the cards. The popup consumer flag is
  // set by the main-chat Quick Messages popup while it's open; Conversation
  // Mode keeps the cards visible the whole time it's active.
  if (!inConversation && !q.popupConsumer) return;
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
  // Capture current suggestions as the "previous list" so Gemini can do a
  // keep/drop/add merge instead of a full replace. If we're empty (first
  // entry into Conversation Mode), this is undefined and Gemini generates
  // from scratch.
  const previousSuggestions =
    q.suggestions.length > 0 ? q.suggestions : undefined;
  q.setGenerating(true);
  try {
    const snapshotText = snapshotToText(snapshot);
    const history = buildHistorySnippet();
    const batch = await generateQuickMessages({
      sensorSnapshot: snapshotText,
      history,
      count: TARGET_BATCH_SIZE,
      previousSuggestions,
    });
    useQuick.getState().setSuggestions(batch, fp);
    if (snapshot.location) {
      lastAnchorLat = snapshot.location.latitude;
      lastAnchorLon = snapshot.location.longitude;
    }
    const kept = previousSuggestions
      ? previousSuggestions.filter((p) =>
          batch.some((b) => b.label === p.label)
        ).length
      : 0;
    console.log(
      `[quickGen] batch of ${batch.length} (kept ${kept}, dropped ${
        previousSuggestions ? previousSuggestions.length - kept : 0
      }, new ${batch.length - kept}) fp=${fp}`
    );
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
