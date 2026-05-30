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

const native = requireNativeModule<ActivityRecognitionModuleType>("ActivityRecognitionModule");

export async function hasActivityPermission(): Promise<boolean> {
  return native.hasPermission();
}

export async function startActivityUpdates(intervalMs = 30_000): Promise<void> {
  return native.startUpdates(intervalMs);
}

export async function stopActivityUpdates(): Promise<void> {
  return native.stopUpdates();
}

export async function getCurrentActivity(): Promise<DetectedActivity | null> {
  return native.getCurrentActivity();
}
