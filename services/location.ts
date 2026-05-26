import * as Location from "expo-location";
import type { LocationData, TransportMode } from "@/types";

/** 1550 Weisflock Rd, Lynchburg OH 45142 — geocoded via Google Maps Geocoding API. */
export const HOME_COORDS = { lat: 39.2502766, lon: -83.8475516 } as const;

/** Radius (meters) within which we consider Tim "at home". */
export const HOME_RADIUS_M = 50;

/**
 * Haversine distance in meters between two lat/lon points.
 * Good to ~1m accuracy at this scale.
 */
export function distanceMeters(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number }
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function isAtHome(coords: { latitude: number; longitude: number }): boolean {
  return (
    distanceMeters({ lat: coords.latitude, lon: coords.longitude }, HOME_COORDS) <=
    HOME_RADIUS_M
  );
}

/**
 * Ensure foreground location permission. Shows the Android prompt on first call.
 */
export async function ensureLocationPermission(): Promise<boolean> {
  const current = await Location.getForegroundPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const res = await Location.requestForegroundPermissionsAsync();
  return res.granted;
}

/**
 * Get the current GPS fix as a `LocationData`. Returns null on permission
 * denial, timeout, or location services being off — caller should fall back
 * gracefully rather than failing the whole message send.
 *
 * Uses `Accuracy.High` (pure GPS, ~5m accuracy) rather than `Balanced` to
 * avoid the Wi-Fi-pinning problem: Balanced blends network-based location
 * which tends to snap to the last Wi-Fi access point the device saw, which
 * means a short walk away from home stays reporting as "home" until cell
 * tower triangulation catches up.
 */
export async function getCurrentLocation(): Promise<LocationData | null> {
  try {
    const granted = await ensureLocationPermission();
    if (!granted) return null;

    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
      // mayShowUserSettingsDialog: false so a low-power device setting
      // doesn't silently degrade us back to coarse locations.
      mayShowUserSettingsDialog: false,
    });

    const loc = {
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      altitude: pos.coords.altitude ?? undefined,
      speed: pos.coords.speed ?? undefined,
      heading: pos.coords.heading ?? undefined,
      accuracy: pos.coords.accuracy ?? 0,
      timestamp: pos.timestamp,
    };

    // Diagnostic log — shows whether isAtHome is firing where it should,
    // and how accurate the fix is. Grep `[gps]` in logcat during a walk
    // to see fix drift over time.
    const dist = distanceMeters(
      { lat: loc.latitude, lon: loc.longitude },
      HOME_COORDS
    );
    console.log(
      `[gps] fix: ${loc.latitude.toFixed(5)}, ${loc.longitude.toFixed(5)} ±${Math.round(loc.accuracy)}m · ${Math.round(dist)}m from home · ${dist <= HOME_RADIUS_M ? "AT_HOME" : "AWAY"} · speed ${loc.speed?.toFixed(1) ?? "?"}m/s`
    );

    return loc;
  } catch (err) {
    console.warn("[gps] getCurrentLocation failed:", err);
    return null;
  }
}

/**
 * Infer transport mode from GPS speed. Not as accurate as Google's Activity
 * Recognition API (which is a native module deferred to Phase 8), but
 * serviceable for the common cases.
 *
 * Single-sample variant — exposed mostly for the diagnostics panel where the
 * raw GPS-reported speed is the right thing to display. Production code paths
 * (poller, liveSensors) should use `inferActivityFromMotion` instead, which
 * smooths over GPS speed glitches that flip the user to "still" when they're
 * actually moving (red lights, indoor fixes, brief satellite-loss dips).
 *
 * Speed in m/s from expo-location. 1 m/s ≈ 2.24 mph.
 */
export function inferActivityFromSpeed(speedMs: number | undefined): TransportMode {
  if (speedMs === undefined || speedMs === null) return "still";
  return classifySpeedMs(speedMs);
}

function classifySpeedMs(speedMs: number): TransportMode {
  if (speedMs < 0.5) return "still";      // < 1 mph
  if (speedMs < 2.0) return "walking";    // 1–4.5 mph
  if (speedMs < 5.0) return "running";    // 4.5–11 mph (or cycling — ambiguous)
  return "car";                           // > 11 mph
}

// ── Rolling motion buffer ───────────────────────────────────────────
//
// Activity classification used to read one GPS speed sample per poller tick.
// That broke in two ways Tim hit in the field:
//   - Driving false-still: red lights, parking-lot crawl, GPS glitches drop
//     reported speed to 0 m/s for a tick or two. With no smoothing, that's
//     a "still" classification, which feeds the Drive Mode auto-exit streak
//     and can kick Tim out mid-drive.
//   - Walking false-still: any sub-0.5 m/s sample (waiting at a crosswalk,
//     browsing in a store, picking something up) drops to "still" instantly.
//
// The buffer below holds ~90 seconds of GPS fixes (timestamp + position).
// `inferActivityFromMotion` classifies on the MAX of (instantaneous speed,
// cumulative-distance / window-seconds), so any real motion in the last 90s
// keeps the classification away from "still" until the user has genuinely
// been stationary for the full window.

interface MotionSample {
  t: number;
  lat: number;
  lon: number;
}

const MOTION_WINDOW_MS = 90_000;
const MAX_MOTION_SAMPLES = 12;
const motionBuffer: MotionSample[] = [];

/**
 * Push a GPS fix into the rolling motion buffer. Callers (drivingPoller,
 * liveSensors) should call this once per tick BEFORE invoking
 * `inferActivityFromMotion` so the latest sample is in the window.
 */
export function recordMotionSample(loc: LocationData): void {
  const now = Date.now();
  motionBuffer.push({ t: now, lat: loc.latitude, lon: loc.longitude });
  while (motionBuffer.length > MAX_MOTION_SAMPLES) motionBuffer.shift();
  while (motionBuffer.length > 0 && now - motionBuffer[0].t > MOTION_WINDOW_MS) {
    motionBuffer.shift();
  }
}

/**
 * Clear the motion buffer. Call on session start (so a fresh session
 * doesn't inherit motion history from a prior one) and on session end.
 */
export function resetMotionBuffer(): void {
  motionBuffer.length = 0;
}

/**
 * Smoothed activity inference. Combines the GPS-reported instantaneous speed
 * with the cumulative-distance / time signal from the rolling buffer to
 * survive single-sample speed glitches.
 *
 * Returns the same TransportMode shape as inferActivityFromSpeed so callers
 * are drop-in compatible.
 */
export function inferActivityFromMotion(speedMs: number | undefined): TransportMode {
  const reported = speedMs ?? 0;

  // Insufficient buffer to compute a windowed speed — fall back to the
  // instantaneous reading. Happens on the first 1–2 ticks of a session.
  if (motionBuffer.length < 2) return classifySpeedMs(reported);

  let totalDist = 0;
  for (let i = 1; i < motionBuffer.length; i++) {
    const a = motionBuffer[i - 1];
    const b = motionBuffer[i];
    totalDist += distanceMeters(
      { lat: a.lat, lon: a.lon },
      { lat: b.lat, lon: b.lon }
    );
  }
  const windowSec = (motionBuffer[motionBuffer.length - 1].t - motionBuffer[0].t) / 1000;
  const windowedSpeed = windowSec > 0 ? totalDist / windowSec : 0;

  // MAX of the two sources:
  //   - reported speed catches "just started moving, buffer hasn't filled"
  //   - windowed speed catches "GPS reported 0 but we actually moved"
  const effectiveSpeed = Math.max(reported, windowedSpeed);
  return classifySpeedMs(effectiveSpeed);
}
