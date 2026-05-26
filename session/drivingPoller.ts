import type { SensorSnapshot, LocationData } from "@/types";
import {
  getCurrentLocation,
  inferActivityFromMotion,
  isAtHome,
  distanceMeters,
  recordMotionSample,
  resetMotionBuffer,
} from "@/services/location";
import { getCurrentWeather } from "@/services/weather";
import { reverseGeocode } from "@/services/places";
import { useMode } from "@/stores/modeStore";
import { useSettings } from "@/stores/settingsStore";
import { useChat } from "@/stores/chatStore";
import { useAudio } from "@/stores/audioStore";

/**
 * Background poller. One GPS fix every POLL_INTERVAL_MS, fed into:
 *   1. modeStore.evaluateTransitions — drives driving-auto-entry banner
 *      (venue auto-detect output is no longer surfaced as cards/scene
 *      pushes; Tim manages places via Save Place + Brief).
 *   2. live-context banner — composes a chip set from already-fetched data
 *      so the banner stays current between messages.
 *   3. stuck-pipeline watchdog — backstop in case an upstream call slips
 *      past its timeout.
 */

const POLL_INTERVAL_MS = 15_000;

// Stuck-state thresholds for the watchdog. Generous bounds — the upstream
// timeouts in services/gemini.ts, /elevenlabs.ts, /kindroid.ts should mean
// these are never hit. They exist as a backstop in case a future change
// introduces an unbounded path.
const STUCK_SEND_MS = 180_000; // 3 min — covers worst-case stack of Gemini + Kindroid
// addAudioTags(15s) + synthesizeToFile(180s hard cap) + 30s slack. The new
// synth wall isn't a single timer — it's a first-byte timer + per-chunk
// stall timer + a 3-min hard cap. The watchdog only needs to cover the
// worst case where all three legitimately accumulate.
const STUCK_GENERATING_MS = 225_000;

// Live-banner geocode cache: re-geocode only when Tim has moved >100m from
// the last cached point. Avoids hitting the Places API every 15s while
// stationary. Cleared on session start.
const BANNER_REGEOCODE_DISTANCE_M = 100;
let bannerGeocodeCache: {
  fix: { lat: number; lon: number };
  placeName: string | null;
} | null = null;

let pollTimer: ReturnType<typeof setInterval> | null = null;
let pollInFlight = false;

async function tick() {
  if (pollInFlight) return;
  pollInFlight = true;
  try {
    const loc = await getCurrentLocation();
    if (!loc) return;
    // Feed the smoothing buffer FIRST so this tick's classification factors
    // in the latest fix. Without this push, the windowed-speed calc would
    // be operating on stale data and the very first "0 m/s" sample after a
    // long drive could still flip activity to "still".
    recordMotionSample(loc);
    const snapshot: SensorSnapshot = {
      location: loc,
      activity: inferActivityFromMotion(loc.speed),
    };
    const drivingAutoEnabled = useSettings.getState().drivingModeAuto;
    // Run for its driving-auto side effect (banner state). Venue transitions
    // returned here are intentionally ignored — Tim controls venue context
    // through Save Place rather than auto-detection.
    useMode.getState().evaluateTransitions(snapshot, { drivingAutoEnabled });

    await updateLiveContext(loc, snapshot);
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
  loc: LocationData,
  snapshot: SensorSnapshot
): Promise<void> {
  const chips: string[] = [];

  // Location chip
  if (isAtHome({ latitude: loc.latitude, longitude: loc.longitude })) {
    chips.push("📍 Home");
    bannerGeocodeCache = null; // reset cache so leaving home re-geocodes promptly
  } else {
    const placeName = await getCachedPlaceName(loc);
    if (placeName) chips.push(`📍 ${placeName}`);
  }

  // Weather chip — service caches 5min/500m, near-free to call repeatedly
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

  useChat.getState().setLiveContext(chips);
}

async function getCachedPlaceName(loc: LocationData): Promise<string | null> {
  if (bannerGeocodeCache) {
    const moved = distanceMeters(
      { lat: loc.latitude, lon: loc.longitude },
      { lat: bannerGeocodeCache.fix.lat, lon: bannerGeocodeCache.fix.lon }
    );
    if (moved < BANNER_REGEOCODE_DISTANCE_M) {
      return bannerGeocodeCache.placeName;
    }
  }

  let placeName: string | null = null;
  try {
    const place = await reverseGeocode(loc.latitude, loc.longitude);
    placeName = place?.name ?? null;
  } catch {
    placeName = null;
  }
  bannerGeocodeCache = {
    fix: { lat: loc.latitude, lon: loc.longitude },
    placeName,
  };
  return placeName;
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
  bannerGeocodeCache = null;
  // Clear any motion history from a prior session so the smoothed activity
  // signal starts cold. Without this, the first tick of a new session could
  // inherit "windowed speed = 30 mph" from yesterday's drive home.
  resetMotionBuffer();
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
  bannerGeocodeCache = null;
  resetMotionBuffer();
}
