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
 * Speed in m/s from expo-location. 1 m/s ≈ 2.24 mph.
 */
export function inferActivityFromSpeed(speedMs: number | undefined): TransportMode {
  if (speedMs === undefined || speedMs === null) return "still";
  if (speedMs < 0.5) return "still";      // < 1 mph
  if (speedMs < 2.0) return "walking";    // 1–4.5 mph
  if (speedMs < 5.0) return "running";    // 4.5–11 mph (or cycling — ambiguous)
  return "car";                           // > 11 mph
}
