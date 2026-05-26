import { create } from "zustand";
import {
  persistTimeline,
  hydrateTimeline,
} from "@/session/timelinePersistence";

/**
 * Session Timeline — both a presentation layer (what happened during the
 * session) and a diagnostic one (errors, queue states, abort fires). Tim
 * opens the slide-in panel to scroll the day, or to grab the contents and
 * push them to Obsidian for review on his desktop.
 *
 * Sources push events here via `useTimeline.getState().append(...)`. The
 * UI subscribes to `events` for the live render and to `stats` (derived
 * client-side, no store field) for the header.
 *
 * Events persist to disk so a deep-background OOM kill doesn't wipe the
 * day's history (same hazard as chat persistence — Tim hit it at the zoo).
 */

export type TimelineEventKind =
  | "session-start"
  | "session-end"
  | "location"
  | "drive-enter"
  | "drive-exit"
  | "venue-enter"
  | "venue-exit"
  | "attachment-staged"
  | "scene-captured"
  | "message-sent"
  | "message-queued"
  | "eli-replied"
  | "saved-place"
  | "brief-sent"
  | "abort"
  | "error";

export interface TimelineEvent {
  id: string;
  /** ms epoch. Rendered as both an ISO line in exports and a clock time in UI. */
  t: number;
  kind: TimelineEventKind;
  /** Emoji shown in the timeline rail. */
  icon: string;
  /** Short headline — single line, ~50 chars. */
  label: string;
  /** Optional second line of detail (place name, error message, count, etc.). */
  detail?: string;
  /** Optional diagnostic payload — appears as JSON under the entry in the
   *  exported markdown. NOT shown in the in-app UI (would clutter). */
  meta?: Record<string, unknown>;
}

interface TimelineState {
  events: TimelineEvent[];
  /** True while the export action is in flight (popup spinner). */
  exporting: boolean;
  /** Last export result for toast/banner. Cleared on next append/reset. */
  lastExport: { ok: true; vaultPath: string } | { ok: false; error: string } | null;

  /**
   * Append a new event to the timeline. Caller passes the kind + icon +
   * label/detail; the store stamps ID and timestamp. Persist runs debounced.
   */
  append: (event: Omit<TimelineEvent, "id" | "t"> & { t?: number }) => void;

  /** Clear the in-memory + on-disk timeline. Called on session start/end. */
  clear: () => void;

  /** Replace the events list (used by hydrate on app boot). */
  hydrate: () => Promise<void>;

  /** Export the current timeline to Obsidian. Set externally by
   *  session/timelineExport so this store stays UI-agnostic. */
  exportToVault: () => Promise<void>;
  /** Setter wired up at boot — keeps the store import-cycle-free by not
   *  importing the export module directly. */
  setExporter: (fn: () => Promise<{ vaultPath: string }>) => void;
}

let exporterFn: (() => Promise<{ vaultPath: string }>) | null = null;

function newId(): string {
  return `tl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export const useTimeline = create<TimelineState>((set, get) => ({
  events: [],
  exporting: false,
  lastExport: null,

  append: (event) => {
    const e: TimelineEvent = {
      id: newId(),
      t: event.t ?? Date.now(),
      kind: event.kind,
      icon: event.icon,
      label: event.label,
      detail: event.detail,
      meta: event.meta,
    };
    set((s) => ({ events: [...s.events, e], lastExport: null }));
  },

  clear: () => {
    set({ events: [], lastExport: null });
    persistTimeline([]);
  },

  hydrate: async () => {
    const persisted = await hydrateTimeline();
    if (persisted.length === 0) return;
    if (get().events.length > 0) return; // guard a race with a fresh session
    set({ events: persisted });
  },

  setExporter: (fn) => {
    exporterFn = fn;
  },

  exportToVault: async () => {
    if (!exporterFn) {
      set({
        lastExport: {
          ok: false,
          error: "Exporter not wired (internal). Reopen the app and try again.",
        },
      });
      return;
    }
    if (get().exporting) return;
    set({ exporting: true, lastExport: null });
    try {
      const res = await exporterFn();
      set({ exporting: false, lastExport: { ok: true, vaultPath: res.vaultPath } });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ exporting: false, lastExport: { ok: false, error: msg } });
    }
  },
}));

// ── Auto-persist (debounced) ───────────────────────────────────────
//
// Mirror the chatStore persistence pattern: subscribe to events changes,
// debounce ~500ms, write the full array to disk. Survives OOM kills.
let writeTimer: ReturnType<typeof setTimeout> | null = null;
let lastPersistedRef: unknown = null;
useTimeline.subscribe((state, prev) => {
  if (state.events === prev.events) return;
  if (state.events === lastPersistedRef) return;
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    lastPersistedRef = state.events;
    persistTimeline(state.events);
  }, 500);
});
