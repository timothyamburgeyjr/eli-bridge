import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Modal,
  Animated,
  Easing,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAudioRecorder } from "expo-audio";
import {
  activateKeepAwakeAsync,
  deactivateKeepAwake,
} from "expo-keep-awake";
import { C } from "@/constants/theme";
import { useChat } from "@/stores/chatStore";
import { useMode } from "@/stores/modeStore";
import { useAudio } from "@/stores/audioStore";
import {
  ensureRecordingPermission,
  setPlaybackAudioMode,
  setRecordingAudioMode,
  VOICE_RECORDING_PRESET,
} from "@/services/audio";

const KEEP_AWAKE_TAG = "eli-bridge-conversation";

/**
 * Full-screen Conversation Mode overlay (formerly Drive Mode). Any tap on the
 * body toggles recording — tap to start, tap to stop+send. No small buttons
 * to aim at. Eli's replies are always spoken through the phone speaker via
 * ElevenLabs so Tim never needs to read the screen.
 *
 * Enter via useMode.enterConversationManual() or auto-trigger (sustained
 * IN_VEHICLE — still the underlying trigger, just renamed at the UI). Exit
 * via the small Stop button at the top.
 */
export function ConversationOverlay() {
  const conversation = useMode((s) => s.conversation);
  const exitConversation = useMode((s) => s.exitConversation);
  const messages = useChat((s) => s.messages);
  const addAttachment = useChat((s) => s.addAttachment);
  const sendMessage = useChat((s) => s.sendMessage);
  const chatStatus = useChat((s) => s.status);

  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recorder = useAudioRecorder(VOICE_RECORDING_PRESET);
  const recorderRef = useRef(recorder);
  recorderRef.current = recorder;
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clean up timer on unmount or state change
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Reset local state when the overlay closes
  useEffect(() => {
    if (!conversation) {
      setRecording(false);
      setElapsed(0);
      setError(null);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  }, [conversation]);

  // Hold a wake-lock while Conversation Mode is active. Without this the screen
  // sleeps mid-conversation and the audio pipeline (recorder + ElevenLabs
  // playback) stops being driven, which leaves Tim talking to a frozen app.
  useEffect(() => {
    if (!conversation) return;
    activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {
      // best-effort; rare on Android, but a failed activation shouldn't
      // crash the overlay
    });
    return () => {
      try {
        deactivateKeepAwake(KEEP_AWAKE_TAG);
      } catch {
        // already deactivated
      }
    };
  }, [conversation]);

  // Force the audio session into playback mode on entry so Eli's TTS routes
  // through the loudspeaker (not the earpiece-friendly comm path that the
  // session-start setupBridgeAudioMode leaves us in). Restore recording mode
  // on exit so the regular InputBar PTT keeps working.
  useEffect(() => {
    if (!conversation) return;
    setPlaybackAudioMode();
    return () => {
      setRecordingAudioMode();
    };
  }, [conversation]);

  // Force-speak every new Eli reply while Conversation Mode is on. Watches the
  // latest Eli message id; when it changes, auto-triggers ElevenLabs playback.
  //
  // Freshness gate: only auto-play messages that are <60s old. Prevents the
  // "audio replays out of nowhere" failure mode where some upstream state
  // change (queue drain, cache update, store re-emit) walks the loop and
  // matches an OLD Eli message with a stale or cleared lastAutoSpokenRef.
  // The ref alone isn't enough — if it's ever wrong, an old message replays.
  // The freshness gate is a bound on how wrong things can get.
  const lastAutoSpokenRef = useRef<string | null>(null);
  const playEli = useAudio((s) => s.playEli);
  useEffect(() => {
    if (!conversation) return;
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.from !== "eli") continue;
      if (lastAutoSpokenRef.current === m.id) return;
      const raw = m.raw ?? (m.emote ? `_(*${m.emote}*)_ ${m.dialog}` : m.dialog);
      if (!raw) return;
      const msgTs = extractTimestampFromId(m.id);
      const ageMs = msgTs !== null ? Date.now() - msgTs : null;
      if (ageMs !== null && ageMs > 60_000) {
        // Stale — claim it without auto-playing, so future ticks don't
        // keep examining the same old message.
        console.log(
          `[conv] auto-speak SKIP (stale) msg=${m.id} age=${ageMs}ms`
        );
        lastAutoSpokenRef.current = m.id;
        return;
      }
      console.log(
        `[conv] auto-speak FIRE msg=${m.id} age=${ageMs ?? "?"}ms`
      );
      lastAutoSpokenRef.current = m.id;
      playEli(m.id, raw);
      return;
    }
  }, [conversation, messages, playEli]);

  // TTS lifecycle from audioStore — we need to block recording while audio
  // is generating/playing, and let a tap on the screen stop playback.
  const audioEntry = useAudio((s) =>
    s.currentMessageId ? s.cache[s.currentMessageId] : undefined
  );
  const stopAudio = useAudio((s) => s.stop);
  const audioGenerating = audioEntry?.status === "generating";
  const audioPlaying = audioEntry?.status === "playing";

  // Pulse animation on the status line while Gemini/Kindroid/ElevenLabs are
  // working so the screen feels alive (Tim can glance at it without pulling
  // focus from the road). Steady (no pulse) while Eli is actually speaking.
  const pulse = useRef(new Animated.Value(1)).current;
  const waiting =
    chatStatus === "assembling" ||
    chatStatus === "sending" ||
    audioGenerating;
  const thinking = waiting || audioPlaying;
  useEffect(() => {
    if (!waiting) {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.35,
          duration: 600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [waiting, pulse]);

  const handleTap = async () => {
    // Block taps while Gemini is assembling or Kindroid is relaying.
    if (chatStatus === "assembling" || chatStatus === "sending") return;

    // While ElevenLabs is generating, the audio isn't playable yet — no-op.
    // As soon as it starts playing, a tap should interrupt + return to idle.
    if (audioGenerating) return;
    if (audioPlaying) {
      stopAudio();
      return;
    }

    if (recording) {
      // Stop + send
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      try {
        await recorderRef.current.stop();
        const uri = recorderRef.current.uri;
        setRecording(false);
        setElapsed(0);
        // Flip back to playback mode so Eli's incoming TTS reply hits the
        // loudspeaker. Fire-and-forget — don't block the send on it.
        setPlaybackAudioMode();
        if (uri) {
          addAttachment({
            kind: "audio",
            localPath: uri,
            mimeType: "audio/mp4",
            duration: Math.max(1, elapsed),
          });
          // Empty dialog — audio is the message
          await sendMessage("");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Stop-recording failed");
      }
      return;
    }

    // Start recording
    setError(null);
    const granted = await ensureRecordingPermission();
    if (!granted) {
      setError("Mic permission denied.");
      return;
    }
    try {
      // Switch the audio session into recording mode before grabbing the
      // mic. Without this the prepareToRecordAsync call below can fail
      // silently after a TTS playback left the session in playback mode.
      await setRecordingAudioMode();
      await beginRecordingCycle(recorderRef.current);
      setRecording(true);
      setElapsed(0);
      timerRef.current = setInterval(() => {
        setElapsed((e) => e + 1);
      }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Recording failed");
    }
  };

  if (!conversation) return null;

  const statusLine =
    chatStatus === "assembling"
      ? "Gemini thinking…"
      : chatStatus === "sending"
      ? "Eli thinking…"
      : audioGenerating
      ? "Preparing Eli's voice…"
      : audioPlaying
      ? "Eli speaking · tap to stop"
      : recording
      ? `Recording · ${formatTime(elapsed)} · tap anywhere to send`
      : "Tap anywhere to speak";

  return (
    <Modal visible={conversation} animationType="fade" statusBarTranslucent>
      <SafeAreaView style={styles.root} edges={["top", "bottom", "left", "right"]}>
        {/* Top strip */}
        <View style={styles.topStrip}>
          <Text style={styles.modeLabel}>🎙 Conversation Mode</Text>
          <Pressable onPress={exitConversation} style={styles.exitBtn} hitSlop={16}>
            <Text style={{ color: C.red, fontSize: 13, fontWeight: "600" }}>
              Stop
            </Text>
          </Pressable>
        </View>

        {/* Body — tap anywhere. No conversation text; feedback is via the
            central indicator, the flashing status line, and ElevenLabs audio. */}
        <Pressable onPress={handleTap} style={styles.body}>
          <View
            style={[
              styles.indicator,
              recording && styles.indicatorRecording,
              thinking && styles.indicatorBusy,
            ]}
          >
            {waiting ? (
              <ActivityIndicator size="large" color={C.accent} />
            ) : audioPlaying ? (
              <Text style={styles.indicatorGlyph}>🔊</Text>
            ) : (
              <Text style={styles.indicatorGlyph}>
                {recording ? "■" : "🎙️"}
              </Text>
            )}
          </View>

          <Animated.Text
            style={[
              styles.statusLine,
              recording && { color: C.red, fontWeight: "700" },
              waiting && { color: C.accent, fontWeight: "600", opacity: pulse },
              audioPlaying && { color: C.accent, fontWeight: "600" },
            ]}
          >
            {statusLine}
          </Animated.Text>

          {error ? <Text style={styles.error}>⚠ {error}</Text> : null}
        </Pressable>
      </SafeAreaView>
    </Modal>
  );
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

/** Pulls the trailing Date.now() out of message IDs like "eli-1714671234567". */
function extractTimestampFromId(id: string): number | null {
  const m = id.match(/-(\d{13})$/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Start a recording cycle robustly. expo-audio's recorder (Android, SDK 55)
 * doesn't reliably reset after stop() across multiple record cycles in one
 * session — prepareToRecordAsync or record() throws IllegalStateException
 * because the native MediaRecorder is in a stale state.
 *
 * Defense: always stop() first to force the recorder back to a clean state
 * (a no-op throw when nothing's recording, swallowed). Then prepare + record.
 * If record() still throws, hard-reset once more and retry — one retry only,
 * then surface the error so the watchdog / Tim's tap can recover.
 */
async function beginRecordingCycle(
  recorder: { prepareToRecordAsync: () => Promise<unknown>; record: () => void; stop: () => Promise<unknown> }
): Promise<void> {
  const attempt = async () => {
    try {
      await recorder.stop();
    } catch {
      // nothing was recording — expected on the happy path
    }
    await recorder.prepareToRecordAsync();
    recorder.record();
  };

  try {
    await attempt();
  } catch (firstErr) {
    console.warn("[conv] recording cycle failed once, retrying:", firstErr);
    // Brief pause to let the native recorder settle before the retry.
    await new Promise((r) => setTimeout(r, 200));
    await attempt(); // if this throws, it propagates to the caller's catch
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  topStrip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  modeLabel: { color: C.accent, fontSize: 14, fontWeight: "700" },
  exitBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.red + "66",
    backgroundColor: C.red + "18",
  },
  body: {
    flex: 1,
    paddingHorizontal: 24,
    paddingVertical: 20,
    alignItems: "center",
    justifyContent: "center",
    gap: 28,
  },
  indicator: {
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 3,
    borderColor: C.accent + "55",
    backgroundColor: C.accent + "14",
    alignItems: "center",
    justifyContent: "center",
  },
  indicatorRecording: {
    borderColor: C.red,
    backgroundColor: C.red + "18",
  },
  indicatorBusy: {
    borderColor: C.accent,
    backgroundColor: C.accent + "26",
  },
  indicatorGlyph: {
    fontSize: 84,
  },
  statusLine: {
    fontSize: 16,
    color: C.textDim,
    textAlign: "center",
  },
  error: {
    color: C.red,
    fontSize: 13,
    marginTop: 8,
  },
});
