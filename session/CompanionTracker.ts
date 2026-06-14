import { create } from "zustand";
import { File, Paths } from "expo-file-system";
import { usePeople } from "@/people/PeopleStore";

/**
 * Companion state machine for the PRESENT anchor.
 *
 * Default state is empty list = "just Tim and Eli." Eli is implied (he is
 * the listener), Tim is implied (he is the speaker). The tracker only holds
 * OTHER people physically present in the moment — Hank in the passenger seat,
 * Mom at the kitchen table.
 *
 * State transitions come from Gemini's per-turn `companionDelta` (parsed
 * out of the emote-assembly call), from voice-ID confirmatory hints, and
 * from Tim's answers on the ClarificationSheet. There is NO auto-decay —
 * removals are explicit only. Speech-as-presence is handled at the
 * voice-ID side via the ClarificationQueue.
 */

export interface Companion {
  /** Display name as it should appear in the PRESENT anchor. Matches a
   *  PeopleStore entry's name when one exists. */
  name: string;
  /** PeopleStore id when the name resolved to a roster entry. Undefined
   *  for ad-hoc names Gemini surfaced that we couldn't link. */
  personId?: string;
  /** Source of the most recent confirmation — useful for debugging drift
   *  and for tightening the prompt later. */
  source: "gemini" | "voice-id" | "clarification" | "manual";
  /** ISO-8601 stamp of when the companion was last confirmed present. */
  lastConfirmedAt: string;
}

interface CompanionState {
  /** Active companions (Tim + Eli implied, not in the list). */
  companions: Companion[];

  /** Add a person to the active companion set. Idempotent — re-adding an
   *  existing companion just refreshes lastConfirmedAt and source. */
  add: (name: string, source: Companion["source"]) => void;

  /** Remove a person from the active set. No-op if they weren't there. */
  remove: (name: string) => void;

  /** Apply a {added, removed} delta in one mutation. The atomic shape
   *  matches what assembleEmote returns. */
  applyDelta: (delta: { added: string[]; removed: string[] }, source: Companion["source"]) => void;

  /** Wipe the list — called on session start. */
  reset: () => void;

  /** Load persisted companions from disk on app boot. */
  hydrate: () => Promise<void>;

  /** Persist to disk after any mutation. Fire-and-forget; failures log. */
  persist: () => Promise<void>;
}

const STORE_FILE = "companions.json";

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Resolve a Gemini-surfaced name to a PeopleStore entry via the roster's
 * exact-name lookup. Falls back to the raw name when no match — the
 * anchor still reads correctly ("with Henry") and a later clarification
 * can promote it to a proper Person link.
 */
function resolveAgainstRoster(name: string): { name: string; personId?: string } {
  const trimmed = name.trim();
  if (!trimmed) return { name: trimmed };
  const match = usePeople.getState().findByName(trimmed);
  if (match) return { name: match.name, personId: match.id };
  return { name: trimmed };
}

export const useCompanions = create<CompanionState>((set, get) => ({
  companions: [],

  add: (name, source) => {
    const resolved = resolveAgainstRoster(name);
    if (!resolved.name) return;
    set((s) => {
      const idx = s.companions.findIndex(
        (c) => c.name.toLowerCase() === resolved.name.toLowerCase()
      );
      if (idx >= 0) {
        // Refresh lastConfirmedAt + source so the anchor reflects the
        // freshest signal we have for an already-present person.
        const next = [...s.companions];
        next[idx] = {
          ...next[idx],
          source,
          lastConfirmedAt: nowIso(),
        };
        return { companions: next };
      }
      return {
        companions: [
          ...s.companions,
          {
            name: resolved.name,
            personId: resolved.personId,
            source,
            lastConfirmedAt: nowIso(),
          },
        ],
      };
    });
    void get().persist();
  },

  remove: (name) => {
    const trimmed = name.trim().toLowerCase();
    if (!trimmed) return;
    set((s) => ({
      companions: s.companions.filter(
        (c) => c.name.toLowerCase() !== trimmed
      ),
    }));
    void get().persist();
  },

  applyDelta: (delta, source) => {
    for (const removed of delta.removed) {
      get().remove(removed);
    }
    for (const added of delta.added) {
      get().add(added, source);
    }
  },

  reset: () => {
    set({ companions: [] });
    void get().persist();
  },

  hydrate: async () => {
    try {
      const file = new File(Paths.document, STORE_FILE);
      if (!file.exists) return;
      const raw = await file.text();
      const parsed = JSON.parse(raw) as { companions?: Companion[] };
      if (Array.isArray(parsed.companions)) {
        set({ companions: parsed.companions });
      }
    } catch (err) {
      console.warn("[CompanionTracker] hydrate failed:", err);
    }
  },

  persist: async () => {
    try {
      const file = new File(Paths.document, STORE_FILE);
      const payload = JSON.stringify({ companions: get().companions });
      await file.write(payload);
    } catch (err) {
      console.warn("[CompanionTracker] persist failed:", err);
    }
  },
}));
