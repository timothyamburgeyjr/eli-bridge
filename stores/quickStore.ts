import { create } from "zustand";
import type { SensorSnapshot } from "@/types";
import {
  generateQuickMessagesForCategory,
  type QuickMessage,
} from "@/services/gemini";
import {
  QUICK_CATEGORIES,
  type QuickCategoryKey,
} from "@/constants/quickCategories";
import { snapshotToText } from "@/session/sensorStub";
import { useChat } from "@/stores/chatStore";
import type { Content } from "@google/generative-ai";

/**
 * Quick Messages store — per-category cache.
 *
 * Generation is **on-demand**: Gemini is never called proactively. When Tim
 * taps a category in the popup, the store checks whether the cached messages
 * for that category are still fresh (per the invalidation policy below). If
 * fresh, the popup renders them instantly. If stale or absent, the store
 * fires a Gemini call and the UI shows a loading state until results land.
 *
 * Invalidation — ANY of these makes the cache stale and forces a re-fetch:
 *   - More than CACHE_TTL_MS since the last successful fetch
 *   - Moved more than CACHE_MOVE_THRESHOLD_M from the anchor of the cached
 *     fetch (where Tim was when the messages were generated)
 *   - Resolved place name changed
 *   - Weather bucket changed (clear ↔ rain/snow/storm)
 *
 * Within a cache window taps are FREE — no Gemini call, instant render.
 * Across a cache window the messages refresh to match the new context.
 */

const CACHE_TTL_MS = 5 * 60 * 1000;            // 5 minutes
const CACHE_MOVE_THRESHOLD_M = 500;             // ~2-3 city blocks
const DEFAULT_COUNT = 6;

export type CategoryStatus = "idle" | "loading" | "ready" | "error";

interface CategoryState {
  status: CategoryStatus;
  messages: QuickMessage[];
  error: string | null;
  /** ms epoch of the last successful fetch (null when status !== "ready"). */
  fetchedAt: number | null;
  /** Context anchor recorded at fetch time — drives invalidation. */
  anchor: {
    lat: number | null;
    lon: number | null;
    placeName: string | null;
    weatherBucket: string;
  } | null;
}

const initialCategoryState = (): CategoryState => ({
  status: "idle",
  messages: [],
  error: null,
  fetchedAt: null,
  anchor: null,
});

interface QuickState {
  /** Per-category cache. Always has all six keys, even before first fetch. */
  byCategory: Record<QuickCategoryKey, CategoryState>;

  /**
   * Fetch messages for a category. Returns immediately if cache is fresh;
   * otherwise fires the Gemini call and updates state as it progresses.
   * Safe to call concurrently — if already loading, the second call no-ops.
   */
  fetchCategory: (
    categoryKey: QuickCategoryKey,
    snapshot: SensorSnapshot
  ) => Promise<void>;

  /**
   * Force a refresh of one category, ignoring the cache. Wired to the
   * pull-to-refresh / explicit refresh affordance in the Detail popup
   * (future — not in MVP).
   */
  refreshCategory: (
    categoryKey: QuickCategoryKey,
    snapshot: SensorSnapshot
  ) => Promise<void>;

  /**
   * Remove the picked message from the cache so the same view doesn't keep
   * showing what Tim just sent. The remaining messages stay valid until the
   * cache invalidates.
   */
  consume: (categoryKey: QuickCategoryKey, index: number) => void;

  /** Wipe everything (called on session start/end). */
  clear: () => void;
}

function emptyByCategory(): Record<QuickCategoryKey, CategoryState> {
  const out = {} as Record<QuickCategoryKey, CategoryState>;
  for (const cat of QUICK_CATEGORIES) {
    out[cat.key] = initialCategoryState();
  }
  return out;
}

export const useQuick = create<QuickState>((set, get) => ({
  byCategory: emptyByCategory(),

  fetchCategory: async (categoryKey, snapshot) => {
    const state = get().byCategory[categoryKey];
    // Don't double-fire while a request is in flight for this category.
    if (state.status === "loading") return;
    // Cache hit + still fresh → no work needed, popup renders cached.
    if (state.status === "ready" && isCacheFresh(state, snapshot)) return;

    await runFetch(set, categoryKey, snapshot);
  },

  refreshCategory: async (categoryKey, snapshot) => {
    if (get().byCategory[categoryKey].status === "loading") return;
    await runFetch(set, categoryKey, snapshot);
  },

  consume: (categoryKey, index) =>
    set((s) => {
      const cur = s.byCategory[categoryKey];
      if (!cur || index < 0 || index >= cur.messages.length) return {};
      const next = [...cur.messages];
      next.splice(index, 1);
      return {
        byCategory: {
          ...s.byCategory,
          [categoryKey]: { ...cur, messages: next },
        },
      };
    }),

  clear: () => set({ byCategory: emptyByCategory() }),
}));

// ── internals ───────────────────────────────────────────────────

async function runFetch(
  set: (
    partial:
      | QuickState
      | Partial<QuickState>
      | ((state: QuickState) => QuickState | Partial<QuickState>)
  ) => void,
  categoryKey: QuickCategoryKey,
  snapshot: SensorSnapshot
): Promise<void> {
  // Mark loading.
  set((s) => ({
    byCategory: {
      ...s.byCategory,
      [categoryKey]: {
        ...s.byCategory[categoryKey],
        status: "loading",
        error: null,
      },
    },
  }));

  try {
    const snapshotText = snapshotToText(snapshot);
    const history = buildHistorySnippet();
    const messages = await generateQuickMessagesForCategory({
      sensorSnapshot: snapshotText,
      categoryKey,
      history,
      count: DEFAULT_COUNT,
    });
    set((s) => ({
      byCategory: {
        ...s.byCategory,
        [categoryKey]: {
          status: "ready",
          messages,
          error: null,
          fetchedAt: Date.now(),
          anchor: anchorFromSnapshot(snapshot),
        },
      },
    }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[quick] fetch ${categoryKey} failed:`, msg);
    set((s) => ({
      byCategory: {
        ...s.byCategory,
        [categoryKey]: {
          ...s.byCategory[categoryKey],
          status: "error",
          error: msg,
        },
      },
    }));
  }
}

function isCacheFresh(state: CategoryState, snapshot: SensorSnapshot): boolean {
  if (!state.fetchedAt || !state.anchor) return false;
  // TTL
  if (Date.now() - state.fetchedAt > CACHE_TTL_MS) return false;
  // Place name change
  const placeName = snapshot.location?.placeName ?? null;
  if (placeName !== state.anchor.placeName) return false;
  // Weather bucket change
  if (weatherBucket(snapshot.weather?.conditions) !== state.anchor.weatherBucket) {
    return false;
  }
  // Distance moved
  const loc = snapshot.location;
  if (loc && state.anchor.lat != null && state.anchor.lon != null) {
    const d = haversineMeters(
      { lat: state.anchor.lat, lon: state.anchor.lon },
      { lat: loc.latitude, lon: loc.longitude }
    );
    if (d > CACHE_MOVE_THRESHOLD_M) return false;
  }
  return true;
}

function anchorFromSnapshot(snapshot: SensorSnapshot): CategoryState["anchor"] {
  return {
    lat: snapshot.location?.latitude ?? null,
    lon: snapshot.location?.longitude ?? null,
    placeName: snapshot.location?.placeName ?? null,
    weatherBucket: weatherBucket(snapshot.weather?.conditions),
  };
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

function haversineMeters(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number }
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Build a compact history snippet so Gemini doesn't suggest topics Tim or
 * Eli just covered. Last 6 turns is enough.
 */
function buildHistorySnippet(): Content[] {
  const messages = useChat.getState().messages;
  const recent = messages.slice(-6);
  return recent
    .filter((m) => m.from === "tim" || m.from === "eli")
    .map((m) => ({
      role: m.from === "tim" ? "user" : ("model" as const),
      parts: [
        {
          text: m.raw ?? (m.emote ? `_(*${m.emote}*)_ ${m.dialog}` : m.dialog),
        },
      ],
    }));
}
