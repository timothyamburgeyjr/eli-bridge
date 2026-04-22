import {
  requestRecordingPermissionsAsync,
  getRecordingPermissionsAsync,
  setAudioModeAsync,
  RecordingPresets,
} from "expo-audio";
import type { RecordingOptions } from "expo-audio";

/**
 * Ensure the app has permission to record audio. Shows the Android permission
 * dialog on first call. Returns true on grant.
 */
export async function ensureRecordingPermission(): Promise<boolean> {
  const current = await getRecordingPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const res = await requestRecordingPermissionsAsync();
  return res.granted;
}

/**
 * Configure the Android audio session for voice-communication mode. This
 * enables hardware AEC on the mic so Eli's TTS (when playing simultaneously)
 * doesn't bleed into the recording. Call once on session start.
 */
export async function setupBridgeAudioMode(): Promise<void> {
  try {
    await setAudioModeAsync({
      allowsRecording: true,
      playsInSilentMode: true,
      interruptionMode: "duckOthers",
      shouldPlayInBackground: false,
    });
  } catch {
    // non-fatal; recording will still work in default mode
  }
}

/**
 * Recording preset tuned for speech (PTT + AudioSnap). HIGH_QUALITY at 44.1kHz
 * is overkill for voice and costs Gemini tokens; this reduces to 16kHz mono
 * which is what speech models want anyway.
 */
export const VOICE_RECORDING_PRESET: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 32000,
};

/** AudioSnap burst duration, in seconds. */
export const AUDIOSNAP_DURATION_SEC = 5;
