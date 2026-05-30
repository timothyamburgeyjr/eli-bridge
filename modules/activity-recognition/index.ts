import { NativeModule, requireNativeModule } from "expo-modules-core";
import type { TransportMode } from "@/types";

/**
 * Android Activity Recognition module.
 *
 * Wraps Google Play Services' Activity Recognition API. Periodically (default
 * 30s) reports the most-confident DetectedActivity to a BroadcastReceiver,
 * which stores it in a companion-object var so JS reads always see the
 * latest. The Kotlin side maps Android's `IN_VEHICLE / ON_BICYCLE / WALKING /
 * RUNNING / STILL / ON_FOOT` to the project's `TransportMode` strings; noisy
 * values (`TILTING`, `UNKNOWN`) are filtered to null so we never feed garbage
 * into the emote pipeline.
 *
 * The runtime permission (`android.permission.ACTIVITY_RECOGNITION`, Android
 * 10+) is requested from the JS-side service wrapper via `PermissionsAndroid`
 * — keeping native code small. This module only reports whether it's
 * currently granted.
 */

export interface DetectedActivity {
  /** Mapped TransportMode, or null when Android reports TILTING / UNKNOWN. */
  activity: TransportMode | null;
  /** Confidence 0–100 reported by the Activity Recognition API. */
  confidence: number;
  /** Detection time in ms epoch. */
  timestamp: number;
}

declare class ActivityRecognitionModuleType extends NativeModule {
  /** True if `ACTIVITY_RECOGNITION` is currently granted. Always true on Android < 10. */
  hasPermission(): Promise<boolean>;
  /** Subscribe to Activity Recognition updates at the given interval. */
  startUpdates(intervalMs: number): Promise<void>;
  /** Unsubscribe from updates. */
  stopUpdates(): Promise<void>;
  /** Latest detection (sticky — survives across reads), or null if none yet. */
  getCurrentActivity(): Promise<DetectedActivity | null>;
}

// Defensive load. `requireNativeModule` throws synchronously at module-load
// time when the native module isn't registered, which means an OTA push to an
// APK that pre-dates this module (e.g., the f5deaa3 preview build still in the
// field) would crash the entire bundle on import. We swallow that here and
// fall back to a null shim so every JS consumer can keep importing this
// module unchanged; activity reads return null and the snapshot construction
// transparently degrades to the GPS-speed heuristic. Once a fresh native
// build is installed, the module loads and real AR starts working with no
// further code change.
let native: ActivityRecognitionModuleType | null = null;
try {
  native = requireNativeModule<ActivityRecognitionModuleType>("ActivityRecognitionModule");
} catch {
  native = null;
}

/** True when the Kotlin native module is actually present (i.e., the APK was
 *  built with this module). False on older APKs receiving this JS via OTA. */
export function isActivityRecognitionAvailable(): boolean {
  return native !== null;
}

export async function hasActivityPermission(): Promise<boolean> {
  if (!native) return false;
  return native.hasPermission();
}

export async function startActivityUpdates(intervalMs = 30_000): Promise<void> {
  if (!native) return;
  return native.startUpdates(intervalMs);
}

export async function stopActivityUpdates(): Promise<void> {
  if (!native) return;
  return native.stopUpdates();
}

export async function getCurrentActivity(): Promise<DetectedActivity | null> {
  if (!native) return null;
  return native.getCurrentActivity();
}
