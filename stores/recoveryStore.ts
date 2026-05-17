import { create } from "zustand";

/**
 * Cross-pipeline timeout-recovery state. When any of the three upstream
 * steps — Gemini emote assembly, Kindroid relay, ElevenLabs synthesis —
 * fails transiently (timeout, network drop, 5xx), the failing code reports
 * here instead of silently queueing/erroring. The RecoveryPopup observes
 * `failure` and offers Tim two choices: resubmit just that step, or cancel
 * the whole in-flight message.
 *
 * The retry/cancel continuations are closures held at module scope (not in
 * the typed store state — they're not serializable and never persisted).
 * Whichever code path reported the failure provides them.
 */

export type RecoveryStep = "gemini" | "kindroid" | "elevenlabs";

interface RecoveryFailure {
  step: RecoveryStep;
  /** Human-readable error text shown in the popup. */
  message: string;
}

interface RecoveryState {
  failure: RecoveryFailure | null;
  /** True while a resubmit is running — popup shows a spinner, buttons lock. */
  retrying: boolean;

  /**
   * Report a transient step failure. Surfaces the popup. `retry` resumes
   * from the failed step; `cancel` tears down the in-flight message and
   * readies the app for a fresh one.
   */
  reportFailure: (
    step: RecoveryStep,
    message: string,
    retry: () => Promise<void>,
    cancel: () => void
  ) => void;

  /** Popup "Resubmit" — re-run the failed step. */
  resubmit: () => Promise<void>;

  /** Popup "Cancel" — abandon the in-flight message. */
  cancel: () => void;

  /** Clear failure state without running either continuation (e.g. on a
   *  later success, or session reset). */
  clear: () => void;
}

let retryFn: (() => Promise<void>) | null = null;
let cancelFn: (() => void) | null = null;

export const useRecovery = create<RecoveryState>((set, get) => ({
  failure: null,
  retrying: false,

  reportFailure: (step, message, retry, cancel) => {
    retryFn = retry;
    cancelFn = cancel;
    set({ failure: { step, message }, retrying: false });
    console.warn(`[recovery] ${step} step failed transiently: ${message}`);
  },

  resubmit: async () => {
    const fn = retryFn;
    if (!fn) return;
    set({ retrying: true });
    try {
      await fn();
      // fn re-runs the step. If it succeeds, it (or the success path)
      // clears the failure. If it fails again, it reports a fresh failure.
      // Either way, our job here is done.
    } catch (err) {
      // The retry threw outside the step's own recovery handling — surface
      // it as the same failure again so Tim can try once more or cancel.
      const msg = err instanceof Error ? err.message : String(err);
      const cur = get().failure;
      if (cur) {
        set({ failure: { ...cur, message: msg }, retrying: false });
      } else {
        set({ retrying: false });
      }
      return;
    }
    // Only clear retrying if the failure wasn't re-reported by fn.
    if (get().failure === null || get().retrying) {
      set({ retrying: false });
    }
  },

  cancel: () => {
    const fn = cancelFn;
    retryFn = null;
    cancelFn = null;
    set({ failure: null, retrying: false });
    if (fn) {
      try {
        fn();
      } catch (err) {
        console.warn("[recovery] cancel continuation threw:", err);
      }
    }
  },

  clear: () => {
    retryFn = null;
    cancelFn = null;
    set({ failure: null, retrying: false });
  },
}));
