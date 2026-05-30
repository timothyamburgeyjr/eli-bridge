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

// expo-location's getCurrentPositionAsync has NO built-in timeout. Under
// Accuracy.High with weak signal it can hang indefinitely — it never resolves
// AND never rejects, so a try/catch can't save you. That silently wedges every
// caller; the session poller in particular guards re-entry with a pollInFlight
// flag that only clears in a finally, so one hung fix kills GPS, driving
// detection, the live banner and Quick Messages for the entire session (the
// "stuck on Locating…" bug). We race the fix against a wall clock instead.
const GPS_FIX_TIMEOUT_MS = 12_000;

/**
 * Resolve a position without the risk of hanging forever. Races a fresh
 * high-accuracy fix against GPS_FIX_TIMEOUT_MS; on timeout, falls back to the
 * OS's last-known position (an instant cached read) so a stuck GPS still
 * yields a usable, if slightly stale, fix rather than nothing. Returns null
 * only if both the fresh fix times out AND there's no cached position.
 *
 * The timed-out getCurrentPositionAsync promise is left dangling — it can't be
 * cancelled — but it no longer blocks our control flow, so the caller's
 * in-flight guard always clears.
 */
async function getPositionWithTimeout(): Promise<Location.LocationObject | null> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), GPS_FIX_TIMEOUT_MS);
  });
  try {
    const fresh = await Promise.race([
      Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
        // mayShowUserSettingsDialog: false so a low-power device setting
        // doesn't silently degrade us back to coarse locations.
        mayShowUserSettingsDialog: false,
      }),
      timeout,
    ]);
    if (fresh) return fresh;
    console.warn(
      `[gps] getCurrentPositionAsync exceeded ${GPS_FIX_TIMEOUT_MS}ms — falling back to last-known position`
    );
    return await Location.getLastKnownPositionAsync();
  } finally {
    if (timer) clearTimeout(timer);
  }
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

    const pos = await getPositionWithTimeout();
    if (!pos) return null;

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
 * Infer transport mode from GPS speed. **Fallback path** — Google's Activity
 * Recognition API (modules/activity-recognition + services/
 * activityRecognition.ts) is the primary source of activity now; this is
 * what fills in when AR returns null (permission denied, no detection yet,
 * Play Services unavailable). Serviceable but inferior in stop-and-go
 * driving, which is why we moved off it as the default.
 *
 * Single-sample variant — exposed mostly for the diagnostics panel where the
 * raw GPS-reported speed is the right thing to display. Production fallback
 * paths use `inferActivityFromMotion` instead, which smooths over GPS speed
 * glitches.
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
// Minimum lat/lon delta we treat as "this is a meaningfully different fix"
// when deciding whether to drop a sample as a cached duplicate. ~0.0001 deg
// ≈ 11 m at typical mid-latitudes — comfortably above GPS-noise floor and
// well under any walking-pace movement between 15s polls.
const DUPLICATE_FIX_EPSILON = 0.0001;
const motionBuffer: MotionSample[] = [];

/**
 * Push a GPS fix into the rolling motion buffer. Callers (sessionPoller,
 * liveSensors) should call this once per tick BEFORE invoking
 * `inferActivityFromMotion` so the latest sample is in the window.
 *
 * Deduplicates fixes with identical positions to the previous sample. The
 * OS's location provider sometimes returns a cached fix when a fresh one
 * isn't ready yet — same lat/lon, advancing timestamp — and those poison
 * the windowed-distance calc (total distance = 0 even while Tim's driving).
 */
export function recordMotionSample(loc: LocationData): void {
  const now = Date.now();
  const last = motionBuffer[motionBuffer.length - 1];
  if (
    last &&
    Math.abs(last.lat - loc.latitude) < DUPLICATE_FIX_EPSILON &&
    Math.abs(last.lon - loc.longitude) < DUPLICATE_FIX_EPSILON
  ) {
    // Same position as last fix — treat as cached duplicate. Skip the push
    // so the windowed-distance calc doesn't see zero-delta entries.
    return;
  }
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

  // FAST PATH — clearly driving. If the GPS-reported speed is at or above
  // the "car" threshold (11 mph / 5 m/s), trust it immediately and skip
  // the buffer math entirely. This defends against the failure mode where
  // the location provider returns cached/stale fixes that make the
  // windowed-distance calc look like zero movement: as long as the speed
  // reading itself is current and high, we know Tim's in a vehicle.
  if (reported >= 5.0) return "car";

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
  const result = classifySpeedMs(effectiveSpeed);

  // Diagnostic — when we land on "still" with a populated buffer, log the
  // sample stretch so we can post-mortem any remaining false-stills Tim
  // hits in the field. (Grep `[motion]` in adb logcat during a drive.)
  if (result === "still" && motionBuffer.length >= 2) {
    const first = motionBuffer[0];
    const last = motionBuffer[motionBuffer.length - 1];
    console.log(
      `[motion] STILL classified · reported=${reported.toFixed(2)}m/s ` +
        `windowed=${windowedSpeed.toFixed(2)}m/s ` +
        `(${motionBuffer.length} samples over ${windowSec.toFixed(0)}s, ` +
        `${totalDist.toFixed(0)}m total · first→last ` +
        `${first.lat.toFixed(5)},${first.lon.toFixed(5)} → ` +
        `${last.lat.toFixed(5)},${last.lon.toFixed(5)})`
    );
  }

  return result;
}
