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
  /**
   * Diagnostic stats from the ride — useful for tuning thresholds after
   * field data is collected. Not shown in UI; logged for post-hoc review.
   */
  stats: {
    totalSamples: number;
    meanG: number;
    /** 95th-percentile G — a more robust "sustained intensity" than peakG alone. */
    p95G: number;
    /** How many samples crossed PEAK_THRESHOLD_G — crude "intensity count". */
    peakCount: number;
  };
}

type RideEndListener = (event: RideEvent) => void;

// ── Tunable thresholds ────────────────────────────────────────────
// These are first-pass values. After real field data (Kings Island trip,
// fairground, etc.) we can adjust based on the stats logged in RideEvent.
// Lower PEAK_THRESHOLD_G catches more rides (carousels, log flumes) at the
// cost of more false positives (running, stairs); raise it for fewer false
// positives at the cost of missing gentler rides.

/** Magnitude (in G) that must be exceeded to begin a ride candidate.
 *  Standing/walking ~1.0–1.3G; running ~1.5–2.0G; roller coasters 3–5G. */
const PEAK_THRESHOLD_G = 2.5;

/**
 * Number of samples above PEAK_THRESHOLD_G required within PEAK_WINDOW_MS
 * to actually start a ride. One isolated spike (pothole, phone-drop) won't
 * trigger — you need a sustained-ish burst.
 */
const PEAK_CONFIRM_COUNT = 3;
const PEAK_WINDOW_MS = 5_000;

/** Magnitude below which a sample counts as "settled". */
const SETTLED_THRESHOLD_G = 1.3;

/** How long (ms) the reading must stay settled to end the ride. */
const SETTLE_DURATION_MS = 10_000;

/** Minimum ride duration (ms) — shorter events are filtered as bumps/noise. */
const MIN_RIDE_DURATION_MS = 15_000;

/** Cooldown after a ride ends during which no new ride can start. Lets the
 *  accelerometer settle properly so post-ride walking-off jolts don't
 *  immediately trigger a second "ride". */
const POST_RIDE_COOLDOWN_MS = 30_000;

/** Sampling interval (ms). 10Hz is plenty for ride detection. */
const SAMPLE_INTERVAL_MS = 100;

/** GPS re-sample interval for top-speed tracking during an active ride. */
const GPS_SAMPLE_INTERVAL_MS = 3_000;

// ── State ─────────────────────────────────────────────────────────

let subscription: { remove: () => void } | null = null;
let listeners: RideEndListener[] = [];

interface PeakCandidate {
  /** Timestamps (ms epoch) of recent samples where g >= PEAK_THRESHOLD_G. */
  recentPeaks: number[];
}

interface RideInProgress {
  startedAt: number; // ms epoch
  peakG: number;
  lastAboveBaseline: number; // ms epoch of last sample above SETTLED_THRESHOLD_G
  topSpeedMph: number | null;
  startCoord: { latitude: number; longitude: number } | null;
  gpsPollTimer: ReturnType<typeof setInterval> | null;
  /** Rolling accumulator for post-ride stats. */
  gSum: number;
  gCount: number;
  /** Sorted buffer of all G samples (for percentile calc on end). */
  gSamples: number[];
  peakCount: number;
}

let peakCandidate: PeakCandidate = { recentPeaks: [] };
let active: RideInProgress | null = null;
let cooldownUntil = 0;

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
  peakCandidate = { recentPeaks: [] };
  cooldownUntil = 0;
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

  if (active) {
    // ── Active ride path — accumulate stats, track settled-time. ──
    if (g > active.peakG) active.peakG = g;
    if (g >= PEAK_THRESHOLD_G) active.peakCount++;
    active.gSum += g;
    active.gCount++;
    active.gSamples.push(g);
    if (g >= SETTLED_THRESHOLD_G) {
      active.lastAboveBaseline = now;
      return;
    }
    const settledMs = now - active.lastAboveBaseline;
    if (settledMs >= SETTLE_DURATION_MS) {
      endRide(now);
    }
    return;
  }

  // ── Idle path — watching for a qualifying peak burst to start a ride. ──
  if (now < cooldownUntil) return;
  if (g < PEAK_THRESHOLD_G) return;

  // Push peak timestamp, drop any outside the rolling window.
  peakCandidate.recentPeaks.push(now);
  const cutoff = now - PEAK_WINDOW_MS;
  peakCandidate.recentPeaks = peakCandidate.recentPeaks.filter(
    (t) => t >= cutoff
  );

  if (peakCandidate.recentPeaks.length >= PEAK_CONFIRM_COUNT) {
    startRide(peakCandidate.recentPeaks[0], g);
    peakCandidate.recentPeaks = [];
  }
}

function startRide(rideStartMs: number, initialG: number): void {
  const gpsPollTimer = setInterval(sampleGps, GPS_SAMPLE_INTERVAL_MS);
  active = {
    startedAt: rideStartMs,
    peakG: initialG,
    lastAboveBaseline: rideStartMs,
    topSpeedMph: null,
    startCoord: null,
    gpsPollTimer,
    gSum: initialG,
    gCount: 1,
    gSamples: [initialG],
    peakCount: 1,
  };
  console.log(
    `[accelerometer] ride candidate started — first peak ${initialG.toFixed(2)}G`
  );
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

function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const idx = Math.min(
    sortedAsc.length - 1,
    Math.floor((p / 100) * sortedAsc.length)
  );
  return sortedAsc[idx];
}

function endRide(now: number): void {
  if (!active) return;
  const durationMs = now - active.startedAt;
  const snapshot = active;
  if (active.gpsPollTimer) clearInterval(active.gpsPollTimer);
  active = null;
  cooldownUntil = now + POST_RIDE_COOLDOWN_MS;

  // Filter out short bumps / accidental spikes.
  if (durationMs < MIN_RIDE_DURATION_MS) {
    console.log(
      `[accelerometer] ride rejected as too-short: ${Math.round(
        durationMs / 1000
      )}s (min ${MIN_RIDE_DURATION_MS / 1000}s), peak ${snapshot.peakG.toFixed(2)}G`
    );
    return;
  }

  const sorted = [...snapshot.gSamples].sort((a, b) => a - b);
  const meanG = snapshot.gSum / Math.max(1, snapshot.gCount);
  const p95G = percentile(sorted, 95);

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
    stats: {
      totalSamples: snapshot.gCount,
      meanG: Math.round(meanG * 100) / 100,
      p95G: Math.round(p95G * 100) / 100,
      peakCount: snapshot.peakCount,
    },
  };

  console.log(
    `[accelerometer] ride emitted — ${event.durationSec}s, peak ${event.peakG}G, p95 ${event.stats.p95G}G, mean ${event.stats.meanG}G, ${event.stats.peakCount} high-G samples, top ${event.topSpeedMph ?? "?"}mph`
  );

  for (const listener of listeners) {
    try {
      listener(event);
    } catch (err) {
      console.warn("[accelerometer] ride-end listener threw:", err);
    }
  }
}
