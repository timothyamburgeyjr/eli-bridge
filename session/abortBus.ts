/**
 * Pipeline abort bus. Backs the global ⏹ Abort button in the header.
 *
 * Two coordinated mechanisms:
 *   1. A live AbortController whose signal is threaded into every long-running
 *      network call (Gemini deadline races, Kindroid, ElevenLabs, image
 *      uploads). Calling `abort()` kills in-flight fetches that honor it.
 *   2. A monotonic generation counter. Every pipeline step captures the
 *      generation at the moment it starts; before writing its result, it
 *      checks the generation is unchanged. If the user aborted while the
 *      step was running, the generation has incremented and the late result
 *      is silently dropped — this is the backstop for fetches that don't
 *      cleanly respond to AbortSignal (Gemini SDK in particular).
 *
 * Higher-level orchestration (resetting store state, dismissing the recovery
 * popup, removing the pending Tim bubble) lives in `session/abortPipeline.ts`,
 * which is what the UI calls. This module is pure plumbing — no store imports,
 * no UI references — so it can be imported from anywhere without cycles.
 */

let controller: AbortController = new AbortController();
let generation = 0;

/** Signal valid for the current generation. After abort, this is replaced. */
export function currentAbortSignal(): AbortSignal {
  return controller.signal;
}

/** Monotonic counter. Increments once per user-initiated abort. */
export function currentGeneration(): number {
  return generation;
}

/**
 * True if `capturedGen` is older than the current generation — meaning a user
 * abort fired since `capturedGen` was captured. Pipeline writes should bail
 * out early in this case to avoid clobbering the freshly-reset state.
 */
export function isStaleGeneration(capturedGen: number): boolean {
  return capturedGen !== generation;
}

/**
 * Combine the bus signal with a caller-provided signal so a fetch responds to
 * either. Returns a new AbortController whose abort fires when EITHER source
 * aborts. Caller is responsible for cleanup (calling `.abort()` to release
 * listeners) once the operation finishes — typically in a finally block.
 *
 * We don't rely on `AbortSignal.any()` because Hermes (RN's JS engine) doesn't
 * implement it. This duplicates the same semantics with manual wiring.
 */
export function combineWithAbortSignal(extra?: AbortSignal): {
  signal: AbortSignal;
  cleanup: () => void;
} {
  const combined = new AbortController();
  const bus = controller.signal;

  if (bus.aborted) combined.abort(bus.reason);
  if (extra?.aborted) combined.abort(extra.reason);

  const onBusAbort = () => combined.abort(bus.reason);
  const onExtraAbort = () => combined.abort(extra?.reason);
  bus.addEventListener("abort", onBusAbort, { once: true });
  extra?.addEventListener("abort", onExtraAbort, { once: true });

  return {
    signal: combined.signal,
    cleanup: () => {
      bus.removeEventListener("abort", onBusAbort);
      extra?.removeEventListener("abort", onExtraAbort);
    },
  };
}

/**
 * Trip the bus. Bumps the generation counter FIRST so any pipeline write
 * that races with this call (between the network return and the store
 * commit) sees a stale generation and bails. Then aborts the live controller
 * to kill in-flight fetches, then installs a fresh controller for the next
 * pipeline run.
 *
 * Idempotent — calling twice in quick succession just bumps generation twice
 * and creates a second fresh controller; no state corruption.
 */
export function tripAbortBus(reason = "user-aborted"): void {
  generation++;
  const stale = controller;
  controller = new AbortController();
  try {
    stale.abort(reason);
  } catch {
    // some RN versions throw on .abort() if already aborted — ignore
  }
}
