import { Accelerometer, AccelerometerMeasurement } from "expo-sensors";
import { getCurrentLocation } from "./location";

export interface RideEvent {
  /** ISO timestamp when the ride was first detected (peak crossed). */
  startedAt: string;
  /** ISO timestamp when the ride settled back to baseline. */
  endedAt: string;
  /** Total duration of the detected ride, in seconds. */
  durationSec: number;
  /** Max magnitude (in G) observed during the ride. */
  peakG: number;
  /** Max GPS speed observed while ride was active, in mph (null if GPS unavailable). */
  topSpeedMph: number | null;
  /** Optional friendly start location (placeName will be resolved later). */
  startCoord: { latitude: number; longitude: number } | null;
}

type RideEndListener = (event: RideEvent) => void;

// ── Tunable thresholds ────────────────────────────────────────────

/** Magnitude (in G) that must be exceeded to begin a ride candidate. Normal
 *  standing/walking ~1.0–1.3G; roller coasters spike to 3–5G. */
const PEAK_THRESHOLD_G = 2.5;

/** Magnitude below which a sample counts as "settled". */
const SETTLED_THRESHOLD_G = 1.3;

/** How long (ms) the reading must stay settled to end the ride. */
const SETTLE_DURATION_MS = 10_000;

/** Minimum ride duration (ms) — shorter events are filtered as bumps/noise. */
const MIN_RIDE_DURATION_MS = 15_000;

/** Sampling interval (ms). 10Hz is plenty for ride detection. */
const SAMPLE_INTERVAL_MS = 100;

/** GPS re-sample interval for top-speed tracking during an active ride. */
const GPS_SAMPLE_INTERVAL_MS = 3_000;

// ── State ─────────────────────────────────────────────────────────

let subscription: { remove: () => void } | null = null;
let listeners: RideEndListener[] = [];

interface RideInProgress {
  startedAt: number; // ms epoch
  peakG: number;
  lastAboveBaseline: number; // ms epoch of last sample above SETTLED_THRESHOLD_G
  topSpeedMph: number | null;
  startCoord: { latitude: number; longitude: number } | null;
  gpsPollTimer: ReturnType<typeof setInterval> | null;
}

let active: RideInProgress | null = null;

// ── Public API ────────────────────────────────────────────────────

/**
 * Register a callback that fires whenever a complete ride event finishes.
 * Returns an unsubscribe function.
 */
export function onRideEnd(listener: RideEndListener): () => void {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

/**
 * Begin watching the accelerometer for ride events. Idempotent — calling
 * twice without stopRideDetection in between does not stack subscriptions.
 *
 * Intended to run while VenueMode is active (amusement parks, fairgrounds).
 * Outside venues the thresholds produce mostly noise, so the caller should
 * start/stop this based on venue state.
 */
export function startRideDetection(): void {
  if (subscription) return;
  try {
    Accelerometer.setUpdateInterval(SAMPLE_INTERVAL_MS);
    subscription = Accelerometer.addListener(handleSample);
  } catch {
    // Accelerometer unavailable — silently ignore (never fires).
  }
}

/** Stop watching the accelerometer. Called on VenueMode exit or session end. */
export function stopRideDetection(): void {
  if (subscription) {
    subscription.remove();
    subscription = null;
  }
  if (active) {
    if (active.gpsPollTimer) clearInterval(active.gpsPollTimer);
    active = null;
  }
}

/** Is a ride currently in-progress? Useful for UI indicators. */
export function isRideActive(): boolean {
  return active !== null;
}

// ── Internals ─────────────────────────────────────────────────────

function magnitudeG(m: AccelerometerMeasurement): number {
  return Math.sqrt(m.x * m.x + m.y * m.y + m.z * m.z);
}

function handleSample(m: AccelerometerMeasurement): void {
  const g = magnitudeG(m);
  const now = Date.now();

  if (!active) {
    if (g >= PEAK_THRESHOLD_G) {
      startRide(now, g);
    }
    return;
  }

  // Active ride: update peak, track sustained-settled-time.
  if (g > active.peakG) active.peakG = g;
  if (g >= SETTLED_THRESHOLD_G) {
    active.lastAboveBaseline = now;
    return;
  }
  const settledMs = now - active.lastAboveBaseline;
  if (settledMs >= SETTLE_DURATION_MS) {
    endRide(now);
  }
}

function startRide(now: number, initialG: number): void {
  const gpsPollTimer = setInterval(sampleGps, GPS_SAMPLE_INTERVAL_MS);
  active = {
    startedAt: now,
    peakG: initialG,
    lastAboveBaseline: now,
    topSpeedMph: null,
    startCoord: null,
    gpsPollTimer,
  };
  // Grab the start coordinate immediately (fire-and-forget).
  getCurrentLocation()
    .then((loc) => {
      if (!active) return;
      if (loc) {
        active.startCoord = {
          latitude: loc.latitude,
          longitude: loc.longitude,
        };
        if (loc.speed !== undefined) {
          const mph = loc.speed * 2.237;
          if (active.topSpeedMph === null || mph > active.topSpeedMph) {
            active.topSpeedMph = mph;
          }
        }
      }
    })
    .catch(() => {
      // best-effort
    });
}

async function sampleGps(): Promise<void> {
  if (!active) return;
  try {
    const loc = await getCurrentLocation();
    if (!active) return;
    if (loc?.speed !== undefined) {
      const mph = loc.speed * 2.237;
      if (active.topSpeedMph === null || mph > active.topSpeedMph) {
        active.topSpeedMph = mph;
      }
    }
  } catch {
    // best-effort
  }
}

function endRide(now: number): void {
  if (!active) return;
  const durationMs = now - active.startedAt;
  const snapshot = active;
  if (active.gpsPollTimer) clearInterval(active.gpsPollTimer);
  active = null;

  // Filter out short bumps / accidental spikes.
  if (durationMs < MIN_RIDE_DURATION_MS) return;

  const event: RideEvent = {
    startedAt: new Date(snapshot.startedAt).toISOString(),
    endedAt: new Date(now).toISOString(),
    durationSec: Math.round(durationMs / 1000),
    peakG: Math.round(snapshot.peakG * 10) / 10,
    topSpeedMph:
      snapshot.topSpeedMph !== null
        ? Math.round(snapshot.topSpeedMph)
        : null,
    startCoord: snapshot.startCoord,
  };

  for (const listener of listeners) {
    try {
      listener(event);
    } catch (err) {
      console.warn("[accelerometer] ride-end listener threw:", err);
    }
  }
}
