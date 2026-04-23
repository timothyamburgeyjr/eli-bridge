import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAudioRecorder } from "expo-audio";
import { C } from "@/constants/theme";
import { useChat } from "@/stores/chatStore";
import { useMode } from "@/stores/modeStore";
import { useAudio } from "@/stores/audioStore";
import {
  ensureRecordingPermission,
  VOICE_RECORDING_PRESET,
} from "@/services/audio";

/**
 * Full-screen Driving Mode overlay. Any tap on the body toggles recording —
 * tap to start, tap to stop+send. No small buttons to aim at. Eli's replies
 * are always spoken through the phone speaker via ElevenLabs so Tim never
 * needs to read the screen.
 *
 * Enter via useMode.enterDrivingManual() or auto-trigger (sustained
 * IN_VEHICLE). Exit via the small Stop button at the top.
 */
export function DrivingOverlay() {
  const driving = useMode((s) => s.driving);
  const exitDriving = useMode((s) => s.exitDriving);
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
    if (!driving) {
      setRecording(false);
      setElapsed(0);
      setError(null);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  }, [driving]);

  // Force-speak every new Eli reply while Driving Mode is on. Watches the
  // latest Eli message id; when it changes, auto-triggers ElevenLabs playback.
  const lastAutoSpokenRef = useRef<string | null>(null);
  const playEli = useAudio((s) => s.playEli);
  useEffect(() => {
    if (!driving) return;
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.from !== "eli") continue;
      if (lastAutoSpokenRef.current === m.id) return;
      const raw = m.raw ?? (m.emote ? `_(*${m.emote}*)_ ${m.dialog}` : m.dialog);
      if (!raw) return;
      lastAutoSpokenRef.current = m.id;
      playEli(m.id, raw);
      return;
    }
  }, [driving, messages, playEli]);

  const lastTim = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.from === "tim") return m;
    }
    return null;
  }, [messages]);

  const lastEli = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.from === "eli") return m;
    }
    return null;
  }, [messages]);

  const handleTap = async () => {
    if (chatStatus === "assembling" || chatStatus === "sending") return;

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
      await recorderRef.current.prepareToRecordAsync();
      recorderRef.current.record();
      setRecording(true);
      setElapsed(0);
      timerRef.current = setInterval(() => {
        setElapsed((e) => e + 1);
      }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Recording failed");
    }
  };

  if (!driving) return null;

  const statusLine =
    chatStatus === "assembling"
      ? "Assembling emote…"
      : chatStatus === "sending"
      ? "Eli is thinking…"
      : recording
      ? `Recording · ${formatTime(elapsed)} · tap anywhere to send`
      : "Tap anywhere to speak";

  return (
    <Modal visible={driving} animationType="fade" statusBarTranslucent>
      <SafeAreaView style={styles.root} edges={["top", "bottom", "left", "right"]}>
        {/* Top strip */}
        <View style={styles.topStrip}>
          <Text style={styles.modeLabel}>🚗 Driving Mode</Text>
          <Pressable onPress={exitDriving} style={styles.exitBtn} hitSlop={16}>
            <Text style={{ color: C.red, fontSize: 13, fontWeight: "600" }}>
              Stop
            </Text>
          </Pressable>
        </View>

        {/* Body — tap anywhere */}
        <Pressable onPress={handleTap} style={styles.body}>
          {/* Last conversation turns */}
          <View style={styles.turns}>
            {lastTim ? (
              <Text style={styles.timTurn} numberOfLines={3}>
                You: {lastTim.dialog}
              </Text>
            ) : null}
            {lastEli ? (
              <Text style={styles.eliTurn} numberOfLines={6}>
                Eli: {lastEli.dialog}
              </Text>
            ) : (
              <Text style={styles.eliTurnPlaceholder}>
                Eli will speak your first reply.
              </Text>
            )}
          </View>

          {/* Giant center indicator */}
          <View
            style={[
              styles.indicator,
              recording && styles.indicatorRecording,
              (chatStatus === "assembling" || chatStatus === "sending") &&
                styles.indicatorBusy,
            ]}
          >
            {chatStatus === "assembling" || chatStatus === "sending" ? (
              <ActivityIndicator size="large" color={C.accent} />
            ) : (
              <Text style={styles.indicatorGlyph}>
                {recording ? "■" : "🎙️"}
              </Text>
            )}
          </View>

          <Text
            style={[
              styles.statusLine,
              recording && { color: C.red, fontWeight: "700" },
            ]}
          >
            {statusLine}
          </Text>

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
    justifyContent: "space-between",
  },
  turns: {
    width: "100%",
    gap: 14,
  },
  timTurn: {
    fontSize: 14,
    color: C.muted,
    lineHeight: 20,
  },
  eliTurn: {
    fontSize: 22,
    color: C.text,
    lineHeight: 30,
    fontWeight: "500",
  },
  eliTurnPlaceholder: {
    fontSize: 16,
    color: C.muted,
    fontStyle: "italic",
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
