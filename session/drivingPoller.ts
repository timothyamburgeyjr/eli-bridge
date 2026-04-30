import type { SensorSnapshot } from "@/types";
import type { ChatItem } from "@/components/chat/ChatStream";
import {
  getCurrentLocation,
  inferActivityFromSpeed,
  isAtHome,
} from "@/services/location";
import { getCurrentWeather } from "@/services/weather";
import { useMode } from "@/stores/modeStore";
import { useSettings } from "@/stores/settingsStore";
import { useChat } from "@/stores/chatStore";
import { useAudio } from "@/stores/audioStore";

// Stuck-state thresholds for the watchdog. Generous bounds — the upstream
// timeouts in services/gemini.ts, /elevenlabs.ts, /kindroid.ts should mean
// these are never hit. They exist as a backstop in case a future change
// introduces an unbounded path.
const STUCK_SEND_MS = 180_000; // 3 min — covers worst-case stack of Gemini + Kindroid
const STUCK_GENERATING_MS = 75_000; // 75s — addAudioTags(15s) + synthesizeToFile(30s) + slack
import {
  processArrivalTick,
  resetArrivalWatcher,
  getLastKnownPlace,
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

    // Update the live-context banner. Reuses already-fetched data:
    // - Place name from arrivalWatcher (just updated above)
    // - Weather from getCurrentWeather (5-min / 500m cache)
    // - Activity derived from GPS speed (free)
    // No additional API calls beyond what the tick already did.
    await updateLiveContext(loc, snapshot);

    // Pipeline watchdog. Belt-and-suspenders for the upstream timeouts:
    // if a send or TTS generation is stuck past the worst-case bound,
    // force a reset so Drive Mode unsticks instead of locking Tim out.
    runStuckStateWatchdog();
  } catch {
    // swallow — poll is best-effort; next tick will try again
  } finally {
    pollInFlight = false;
  }
}

function runStuckStateWatchdog(): void {
  const now = Date.now();

  // chatStore: stuck "assembling" or "sending"
  const chat = useChat.getState();
  if (
    (chat.status === "assembling" || chat.status === "sending") &&
    chat.sendStartedAt &&
    now - chat.sendStartedAt > STUCK_SEND_MS
  ) {
    chat.forceResetStuckSend(
      `send pipeline stuck >${Math.round(STUCK_SEND_MS / 1000)}s`
    );
  }

  // audioStore: stuck "generating"
  const audio = useAudio.getState();
  if (audio.currentMessageId) {
    const entry = audio.cache[audio.currentMessageId];
    if (
      entry?.status === "generating" &&
      entry.generatingStartedAt &&
      now - entry.generatingStartedAt > STUCK_GENERATING_MS
    ) {
      audio.forceResetStuckGeneration(
        `TTS generation stuck >${Math.round(STUCK_GENERATING_MS / 1000)}s`
      );
    }
  }
}

async function updateLiveContext(
  loc: { latitude: number; longitude: number },
  snapshot: SensorSnapshot
): Promise<void> {
  const chips: string[] = [];

  // Location chip — at-home shortcut, otherwise the latest geocoded place
  if (isAtHome({ latitude: loc.latitude, longitude: loc.longitude })) {
    chips.push("📍 Home");
  } else {
    const place = getLastKnownPlace();
    if (place) chips.push(`📍 ${place.name}`);
  }

  // Weather chip — cached, near-free to call repeatedly
  try {
    const w = await getCurrentWeather(loc.latitude, loc.longitude);
    if (w) {
      chips.push(`🌤️ ${Math.round(w.temp)}°F ${w.conditions}`);
    }
  } catch {
    // weather is best-effort — banner still useful without it
  }

  // Activity chip
  if (snapshot.activity) chips.push(`🚶 ${snapshot.activity}`);

  // Venue indicator — surface VenueMode so it's not a hidden state
  const venueBoundary = useMode.getState().venueBoundary;
  if (venueBoundary) chips.push(`🎢 ${venueBoundary.name}`);

  useChat.getState().setLiveContext(chips);
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
