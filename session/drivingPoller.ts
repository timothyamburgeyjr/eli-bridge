import type { SensorSnapshot } from "@/types";
import { getCurrentLocation, inferActivityFromSpeed } from "@/services/location";
import { useMode } from "@/stores/modeStore";
import { useSettings } from "@/stores/settingsStore";

/**
 * Poll interval in ms. Balance: short enough to catch driving within ~30s of
 * starting a drive, long enough to not burn battery on constant GPS fixes.
 * Each poll triggers one `Location.getCurrentPositionAsync` call.
 */
const POLL_INTERVAL_MS = 15_000;

let pollTimer: ReturnType<typeof setInterval> | null = null;
let pollInFlight = false;

async function tick() {
  if (pollInFlight) return;
  pollInFlight = true;
  try {
    const loc = await getCurrentLocation();
    if (!loc) return;
    const snapshot: SensorSnapshot = {
      location: loc,
      activity: inferActivityFromSpeed(loc.speed),
    };
    const drivingAutoEnabled = useSettings.getState().drivingModeAuto;
    useMode.getState().evaluateTransitions(snapshot, { drivingAutoEnabled });
  } catch {
    // swallow — poll is best-effort; next tick will try again
  } finally {
    pollInFlight = false;
  }
}

/**
 * Begin background polling for driving-mode auto-detection. Called from
 * SessionStore.start so the polling lifecycle tracks session lifecycle
 * (no polling outside an active session — saves battery).
 *
 * Idempotent: calling twice without a stop() in between does not stack.
 */
export function startDrivingPoll() {
  if (pollTimer) return;
  // Fire an immediate tick so driving is detectable as soon as the session
  // begins. Subsequent ticks run on the interval.
  tick();
  pollTimer = setInterval(tick, POLL_INTERVAL_MS);
}

/** Stop background polling. Called from SessionStore on session end/discard. */
export function stopDrivingPoll() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}
