import type { SensorSnapshot } from "@/types";
import type { ChatItem } from "@/components/chat/ChatStream";
import { getCurrentLocation, inferActivityFromSpeed } from "@/services/location";
import { useMode } from "@/stores/modeStore";
import { useSettings } from "@/stores/settingsStore";
import { useChat } from "@/stores/chatStore";
import {
  processArrivalTick,
  resetArrivalWatcher,
} from "./arrivalWatcher";
import {
  pushVenueEnteredScene,
  pushVenueExitedScene,
  resetSceneDedup,
} from "./sceneUpdater";

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
    const transitions = useMode
      .getState()
      .evaluateTransitions(snapshot, { drivingAutoEnabled });

    // Surface venue transitions detected between messages. Without this, if
    // Tim arrived at Kings Island before sending any message, the chatStore's
    // own evaluateTransitions call would consume the (already-applied)
    // transition and no VenueModeCard would ever fire. Both call sites are
    // idempotent: whichever sees the transition first emits the card and
    // pushes the scene; the other sees no transition.
    const cards: ChatItem[] = [];
    if (transitions.venueEntered) {
      cards.push({
        id: `venue-enter-${Date.now()}`,
        from: "venuemode",
        time: nowTimeString(),
        venueName: transitions.venueEntered.name,
        venueType: transitions.venueEntered.placeType,
        note: "Queue dwells suppressed · rides enabled",
      } as unknown as ChatItem);
      pushVenueEnteredScene({
        name: transitions.venueEntered.name,
        placeType: transitions.venueEntered.placeType,
      });
    }
    if (transitions.venueExited) {
      cards.push({
        id: `venue-exit-${Date.now()}`,
        from: "venuemode",
        time: nowTimeString(),
        venueName: transitions.venueExited.name,
        venueType: transitions.venueExited.placeType,
        note: "Exited — venue mode off",
      } as unknown as ChatItem);
      pushVenueExitedScene({ name: transitions.venueExited.name });
    }
    for (const card of cards) {
      useChat.getState().appendSystemCard(card);
    }

    // Same fix feeds the arrival watcher — re-geocodes only when Tim has
    // moved meaningfully so we don't burn the Places API on stationary noise.
    await processArrivalTick(loc);
  } catch {
    // swallow — poll is best-effort; next tick will try again
  } finally {
    pollInFlight = false;
  }
}

function nowTimeString(): string {
  return new Date().toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
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
  // Reset arrival + scene-dedup state on session start so the previous
  // session's last-pushed scene and emitted destinations don't suppress
  // today's first scene push or first arrival at the same place.
  resetArrivalWatcher();
  resetSceneDedup();
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
