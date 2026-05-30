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
import { getDetectedActivity } from "@/services/activityRecognition";
import { useMode } from "@/stores/modeStore";
import { useChat } from "@/stores/chatStore";
import { useAudio } from "@/stores/audioStore";
import { useTimeline } from "@/stores/timelineStore";
import { maybeRefreshQuickMessages, resetQuickAnchor } from "./quickGenerator";
import { useQuick } from "@/stores/quickStore";

/**
 * Background poller. One GPS fix every POLL_INTERVAL_MS, fed into:
 *   1. modeStore.evaluateTransitions — drives the Conversation-Mode auto-entry
 *      banner (formerly Drive Mode; renamed to Conversation Mode but still
 *      triggered by sustained IN_VEHICLE activity). Venue auto-detect output
 *      is no longer surfaced as cards/scene pushes — Tim manages places via
 *      Save Place + Brief.
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
// 6 min — bumped from 3 min because video sends through Kindroid genuinely
// can take 3-5 min when the clip is rich (5 image_urls + emote + LLM
// reasoning). At 3 min the watchdog would force-error a real in-progress
// send; at 6 min it only fires when something is actually stuck.
const STUCK_SEND_MS = 360_000;
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

// Timeline-event location dedupe: the live banner re-geocodes once every
// 100m of movement, which is way too chatty for the timeline (every 100m
// drive segment would be an entry). Track the last LOGGED place name +
// home-state separately so we only emit a timeline event when the resolved
// place actually changes — e.g. "Home → Lynchburg OH" or "Hillsboro → DC".
let lastLoggedPlace: string | null = null;

let pollTimer: ReturnType<typeof setInterval> | null = null;
let pollInFlight = false;
let pollInFlightSince = 0;

// A single tick should never take this long. getCurrentLocation is now
// timeout-bounded, but the weather + reverse-geocode fetches in
// updateLiveContext have no timeouts of their own — if any of them hangs, the
// finally that clears pollInFlight never runs and polling wedges for the rest
// of the session. Past this bound we abandon the stuck tick's flag and let a
// fresh tick proceed, so one hung network call can't brick the poller.
const MAX_TICK_MS = 60_000;

async function tick() {
  if (pollInFlight) {
    if (Date.now() - pollInFlightSince < MAX_TICK_MS) return;
    console.warn(
      `[poll] previous tick still in flight after ${Math.round(
        (Date.now() - pollInFlightSince) / 1000
      )}s — proceeding anyway`
    );
  }
  pollInFlight = true;
  pollInFlightSince = Date.now();
  try {
    const loc = await getCurrentLocation();
    if (!loc) return;
    // Feed the smoothing buffer FIRST so this tick's classification factors
    // in the latest fix. Without this push, the windowed-speed calc would
    // be operating on stale data and the very first "0 m/s" sample after a
    // long drive could still flip activity to "still".
    recordMotionSample(loc);
    // Activity Recognition is primary; the GPS-speed heuristic is fallback.
    // See services/activityRecognition.ts — it returns null when AR can't
    // produce a reading (permission denied, not yet detected, Play Services
    // unavailable), in which case the motion-buffer-smoothed heuristic
    // covers it.
    const detected = await getDetectedActivity();
    const snapshot: SensorSnapshot = {
      location: loc,
      activity: detected ?? inferActivityFromMotion(loc.speed),
    };
    // Evaluates venue transitions only — Conversation Mode no longer
    // auto-engages on activity. Venue transitions returned here are
    // intentionally ignored; Tim manages venue context via Save Place.
    useMode.getState().evaluateTransitions(snapshot);

    await updateLiveContext(loc, snapshot);

    // Quick Messages: regen the suggestion batch if context shifted enough.
    // The generator suppresses itself when not in Conversation Mode and
    // respects its own cooldown, so this is safe to call every tick.
    maybeRefreshQuickMessages(snapshot);

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

  // Location chip + timeline event on place change
  if (isAtHome({ latitude: loc.latitude, longitude: loc.longitude })) {
    chips.push("📍 Home");
    bannerGeocodeCache = null; // reset cache so leaving home re-geocodes promptly
    logLocationIfChanged(loc, "Home");
  } else {
    const placeName = await getCachedPlaceName(loc);
    if (placeName) {
      chips.push(`📍 ${placeName}`);
      logLocationIfChanged(loc, placeName);
    }
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

/** Emit a timeline event when the resolved place actually changed since
 *  the last logged one. Home <-> Away is treated as a place change. */
function logLocationIfChanged(loc: LocationData, placeLabel: string): void {
  if (placeLabel === lastLoggedPlace) return;
  const detail = `${loc.latitude.toFixed(4)}, ${loc.longitude.toFixed(4)} (±${Math.round(loc.accuracy)}m)`;
  useTimeline.getState().append({
    kind: "location",
    icon: "📍",
    label: lastLoggedPlace
      ? `${lastLoggedPlace} → ${placeLabel}`
      : placeLabel,
    detail,
    meta: { lat: loc.latitude, lon: loc.longitude, accuracy: loc.accuracy },
  });
  lastLoggedPlace = placeLabel;
}

/**
 * Begin background polling for Conversation-Mode auto-detection (and the live
 * context banner + watchdog). Called from SessionStore.start so the polling
 * lifecycle tracks session lifecycle (no polling outside an active session —
 * saves battery).
 *
 * Idempotent: calling twice without a stop() in between does not stack.
 */
export function startSessionPoll() {
  if (pollTimer) return;
  bannerGeocodeCache = null;
  lastLoggedPlace = null;
  // Clear any motion history from a prior session so the smoothed activity
  // signal starts cold. Without this, the first tick of a new session could
  // inherit "windowed speed = 30 mph" from yesterday's drive home.
  resetMotionBuffer();
  // Drop any cached Quick Messages — last session's suggestions are stale
  // relative to a fresh location/weather/trip context.
  useQuick.getState().clear();
  resetQuickAnchor();
  // Fire an immediate tick so driving is detectable as soon as the session
  // begins. Subsequent ticks run on the interval.
  tick();
  pollTimer = setInterval(tick, POLL_INTERVAL_MS);
}

/** Stop background polling. Called from SessionStore on session end/discard. */
export function stopSessionPoll() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  bannerGeocodeCache = null;
  lastLoggedPlace = null;
  resetMotionBuffer();
  useQuick.getState().clear();
  resetQuickAnchor();
}
