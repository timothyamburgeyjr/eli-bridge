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
  await setRecordingAudioMode();
}

/**
 * Switch the audio session to playback-friendly mode. On Android, leaving
 * `allowsRecording: true` while playing back routes audio through the
 * earpiece-friendly comm path, which is much quieter than the loudspeaker
 * at arm's length — exactly the wrong tradeoff for Driving Mode where the
 * phone is in a cradle and Tim needs to hear Eli over road noise.
 *
 * Call this before TTS playback in scenarios where you want max-volume
 * loudspeaker output. Pair with setRecordingAudioMode() before recording.
 */
export async function setPlaybackAudioMode(): Promise<void> {
  try {
    await setAudioModeAsync({
      allowsRecording: false,
      playsInSilentMode: true,
      interruptionMode: "duckOthers",
      shouldPlayInBackground: false,
    });
  } catch {
    // non-fatal — playback will still happen in whatever mode was active
  }
}

/**
 * Switch the audio session to recording mode (required before record()).
 * Use as a counterpart to setPlaybackAudioMode() in flows that toggle
 * between recording and playback (Driving Mode).
 */
export async function setRecordingAudioMode(): Promise<void> {
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
