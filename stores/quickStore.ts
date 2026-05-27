import { create } from "zustand";
import type { QuickMessage } from "@/services/gemini";

/**
 * Quick Messages store. Holds the rolling batch of Gemini-generated
 * tap-to-send cards that appear in the Conversation Mode overlay. The
 * generator (session/quickGenerator.ts) is the only writer; the overlay UI
 * is the only reader. Decoupled so the generator can be triggered from the
 * session poller without the UI knowing how/when refreshes happen.
 *
 * Refresh policy lives in the generator, not the store — the store just
 * exposes set/clear and tracks the "fingerprint" of the context that
 * produced the current batch so the generator can decide whether the
 * current context warrants a regen.
 */

interface QuickState {
  /** Current batch of suggestions. Empty when not yet generated or cleared. */
  suggestions: QuickMessage[];
  /** ms epoch when `suggestions` was set. */
  generatedAt: number | null;
  /** Hash of the inputs that produced `suggestions` — used by the generator
   *  to skip regen when context is effectively unchanged. */
  contextFingerprint: string | null;
  /** True while a generation call is in flight. UI uses this to render a
   *  subdued "regenerating…" state without blanking the cards. */
  generating: boolean;
  /** Last error message from a failed generation, surfaced in View All. */
  lastError: string | null;

  setSuggestions: (
    suggestions: QuickMessage[],
    contextFingerprint: string
  ) => void;
  setGenerating: (generating: boolean) => void;
  setError: (msg: string | null) => void;
  clear: () => void;

  /**
   * Consume the suggestion at index `i` — remove it from the array. UI calls
   * this after a successful sendMessage tap so the slot doesn't show the
   * just-sent card on the next render. If the array empties below the
   * display threshold the generator will refresh on its next poll.
   */
  consume: (index: number) => void;
}

export const useQuick = create<QuickState>((set) => ({
  suggestions: [],
  generatedAt: null,
  contextFingerprint: null,
  generating: false,
  lastError: null,

  setSuggestions: (suggestions, contextFingerprint) =>
    set({
      suggestions,
      generatedAt: Date.now(),
      contextFingerprint,
      generating: false,
      lastError: null,
    }),

  setGenerating: (generating) => set({ generating }),

  setError: (msg) => set({ lastError: msg, generating: false }),

  clear: () =>
    set({
      suggestions: [],
      generatedAt: null,
      contextFingerprint: null,
      generating: false,
      lastError: null,
    }),

  consume: (index) =>
    set((s) => {
      if (index < 0 || index >= s.suggestions.length) return {};
      const next = [...s.suggestions];
      next.splice(index, 1);
      return { suggestions: next };
    }),
}));
