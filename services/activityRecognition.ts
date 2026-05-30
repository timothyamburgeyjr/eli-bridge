import { PermissionsAndroid, Platform } from "react-native";
import {
  hasActivityPermission,
  startActivityUpdates,
  stopActivityUpdates,
  getCurrentActivity,
  type DetectedActivity,
} from "@/modules/activity-recognition";
import type { TransportMode } from "@/types";

/**
 * Activity Recognition service — JS-side wrapper around the native module.
 *
 * Responsibilities:
 *   - Owns the permission ask via `PermissionsAndroid` (kept off the native
 *     side, which only reports current grant state).
 *   - Lazy-initializes: first call → check perm → start updates @ 30s. The
 *     module reuses one PendingIntent across the app lifetime; calling
 *     `startUpdates` again with the same args is a no-op on the Android side
 *     so re-initialization on hot reload is harmless.
 *   - Caches the last permission state so the Diagnostics panel can render
 *     it without round-tripping every render.
 *   - `getDetectedActivity()` returns the native module's latest reading, or
 *     null if AR isn't usable (permission denied, non-Android, Play Services
 *     unavailable). Callers should fall back to the GPS-speed heuristic.
 */

const UPDATE_INTERVAL_MS = 30_000;

export type PermissionState = "granted" | "denied" | "not-requested" | "unavailable";

let permissionCache: PermissionState = "not-requested";
let initialized = false;
let initInFlight: Promise<void> | null = null;

export function getPermissionState(): PermissionState {
  return permissionCache;
}

/**
 * Request the runtime ACTIVITY_RECOGNITION permission. On Android < 10 the
 * permission is install-time and the OS returns granted immediately; on iOS
 * (currently unsupported) returns "unavailable".
 */
export async function requestActivityPermission(): Promise<PermissionState> {
  if (Platform.OS !== "android") {
    permissionCache = "unavailable";
    return permissionCache;
  }
  try {
    const res = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACTIVITY_RECOGNITION,
      {
        title: "Physical Activity",
        message:
          "Eli's Bridge uses your detected activity (walking, driving, cycling) " +
          "to ground his framing of moments. No location data is shared with this " +
          "permission — it's a separate signal from GPS.",
        buttonPositive: "Allow",
        buttonNegative: "Deny",
      }
    );
    permissionCache =
      res === PermissionsAndroid.RESULTS.GRANTED ? "granted" : "denied";
    return permissionCache;
  } catch (err) {
    console.warn("[activityRecognition] permission request failed:", err);
    permissionCache = "unavailable";
    return permissionCache;
  }
}

/**
 * Idempotent init — ensures the permission is checked and updates are
 * started if granted. Safe to call from many entry points; concurrent
 * callers share one in-flight init.
 */
export async function initActivityRecognition(): Promise<void> {
  if (initialized) return;
  if (initInFlight) return initInFlight;

  initInFlight = (async () => {
    try {
      if (Platform.OS !== "android") {
        permissionCache = "unavailable";
        return;
      }
      const granted = await hasActivityPermission();
      if (!granted) {
        // Prompt the user. If they deny, we leave the cache as "denied" and
        // callers fall back to the GPS-speed heuristic.
        const result = await requestActivityPermission();
        if (result !== "granted") return;
      } else {
        permissionCache = "granted";
      }
      await startActivityUpdates(UPDATE_INTERVAL_MS);
      initialized = true;
    } catch (err) {
      // Play Services missing, module unloaded, etc. → unavailable; the GPS
      // fallback in the snapshot construction keeps activity context alive.
      console.warn("[activityRecognition] init failed:", err);
      permissionCache = "unavailable";
    } finally {
      initInFlight = null;
    }
  })();
  return initInFlight;
}

/**
 * Best-effort current activity. Returns the mapped `TransportMode` if AR is
 * up, otherwise null — the snapshot builder should fall back to the legacy
 * GPS-speed heuristic on null.
 *
 * Triggers a lazy init on first call so callers don't need to remember to
 * bootstrap separately.
 */
export async function getDetectedActivity(): Promise<TransportMode | null> {
  if (!initialized && !initInFlight) {
    // Fire-and-forget — don't block this call on the permission prompt.
    void initActivityRecognition();
    return null;
  }
  try {
    const detected: DetectedActivity | null = await getCurrentActivity();
    return detected?.activity ?? null;
  } catch (err) {
    console.warn("[activityRecognition] getCurrentActivity failed:", err);
    return null;
  }
}

/**
 * Full detection (activity + confidence + timestamp) for the Diagnostics row.
 * Surfaces confidence so Tim can sanity-check whether the reading is firm
 * (e.g., 90% IN_VEHICLE) or tentative (40% STILL).
 */
export async function getDetectedActivityFull(): Promise<DetectedActivity | null> {
  try {
    return await getCurrentActivity();
  } catch {
    return null;
  }
}

/** Stop updates — called on session end + on app teardown to save battery. */
export async function shutdownActivityRecognition(): Promise<void> {
  if (!initialized) return;
  try {
    await stopActivityUpdates();
  } catch (err) {
    console.warn("[activityRecognition] stop failed:", err);
  } finally {
    initialized = false;
  }
}
