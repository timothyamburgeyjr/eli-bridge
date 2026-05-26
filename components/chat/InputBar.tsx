import React, { useEffect, useState, useRef } from "react";
import { View, TextInput, Pressable, Text, StyleSheet, ActivityIndicator } from "react-native";
import { useAudioRecorder } from "expo-audio";
import { C } from "@/constants/theme";
import {
  ensureRecordingPermission,
  setupBridgeAudioMode,
  VOICE_RECORDING_PRESET,
} from "@/services/audio";
import { useChat } from "@/stores/chatStore";

interface Props {
  /** Tap the 📍 pin → open the place-picker so Tim can attach a Save Place. */
  onLocationTap: () => void;
  /** Tap the 🎬 scene button → open CaptureModal in scene mode. */
  onSceneTap: () => void;
  /** Tap 🎥 Video / 📷 Photo → open the capture modal in that mode. Video is
   *  passed in disabled state for now (greyed). */
  onPhotoTap: () => void;
  onVideoTap?: () => void;
}

/**
 * Redesigned input bar. Single row holds the location pin, the message field,
 * and a send arrow that always sits on the right (replacing the old mode-
 * dependent mic/send toggle). Below the row, three first-class capture
 * buttons — Video (greyed for now), Photo, Audio — replace the old `+`
 * attachment picker. Audio is inline tap-to-start / tap-to-stop and stages
 * the recording into the attachment tray, matching the old in-bar mic.
 */
export function InputBar({ onLocationTap, onSceneTap, onPhotoTap, onVideoTap }: Props) {
  const [text, setText] = useState("");
  const [recording, setRecording] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const recorder = useAudioRecorder(VOICE_RECORDING_PRESET);
  const recorderRef = useRef(recorder);
  recorderRef.current = recorder;

  const pending = useChat((s) => s.pending);
  const addAttachment = useChat((s) => s.addAttachment);
  const sendMessage = useChat((s) => s.sendMessage);
  const chatStatus = useChat((s) => s.status);

  useEffect(() => {
    setupBridgeAudioMode();
  }, []);

  const sendBusy = chatStatus === "assembling" || chatStatus === "sending";
  const hasSend = text.trim().length > 0 || pending.length > 0;

  const handleSend = async () => {
    if (!hasSend || sendBusy) return;
    const t = text.trim();
    setText("");
    await sendMessage(t);
  };

  const handleAudioTap = async () => {
    if (recording) {
      try {
        await recorderRef.current.stop();
        const uri = recorderRef.current.uri;
        if (uri) {
          addAttachment({
            kind: "audio",
            localPath: uri,
            mimeType: "audio/mp4",
            duration: Math.max(1, Math.floor(recorderRef.current.currentTime)),
          });
        }
      } catch (err) {
        setPermissionError(err instanceof Error ? err.message : "Recording failed");
      } finally {
        setRecording(false);
      }
      return;
    }

    const granted = await ensureRecordingPermission();
    if (!granted) {
      setPermissionError("Mic permission denied. Enable in Android Settings → Apps → Eli Bridge → Permissions.");
      return;
    }
    try {
      await recorderRef.current.prepareToRecordAsync();
      recorderRef.current.record();
      setRecording(true);
      setPermissionError(null);
    } catch (err) {
      setPermissionError(err instanceof Error ? err.message : "Recording failed");
    }
  };

  return (
    <View style={styles.wrap}>
      {recording && (
        <View style={styles.recordingBanner}>
          <View style={styles.redDot} />
          <Text style={{ fontSize: 12, color: C.red }}>
            Recording… tap Audio to stop
          </Text>
        </View>
      )}
      {permissionError && (
        <Pressable onPress={() => setPermissionError(null)}>
          <View style={styles.errorBanner}>
            <Text style={{ color: C.red, fontSize: 11, flex: 1 }}>⚠ {permissionError}</Text>
            <Text style={{ color: C.red, fontSize: 14 }}>×</Text>
          </View>
        </Pressable>
      )}

      {/* ── Message row: location · scene · input · send/mic ── */}
      <View style={styles.messageRow}>
        <Pressable onPress={onLocationTap} style={styles.leadingBtn}>
          <Text style={styles.leadingIcon}>📍</Text>
        </Pressable>

        <Pressable onPress={onSceneTap} style={styles.leadingBtn}>
          <Text style={styles.leadingIcon}>🎬</Text>
        </Pressable>

        <View style={styles.inputWrap}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Message Eli…"
            placeholderTextColor={C.muted}
            multiline
            style={styles.input}
          />
        </View>

        {/* Dual-mode trailing button:
              text/attachments present → ➤ send
              empty → 🎙️ voice memo (tap start, tap stop, stages to tray) */}
        {hasSend ? (
          <Pressable
            onPress={handleSend}
            disabled={sendBusy}
            style={[styles.sendBtn, sendBusy && styles.sendBtnIdle]}
            accessibilityLabel="Send message"
          >
            {sendBusy ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.sendIcon}>➤</Text>
            )}
          </Pressable>
        ) : (
          <Pressable
            onPress={handleAudioTap}
            style={[
              styles.sendBtn,
              recording ? styles.sendBtnRecording : styles.sendBtnMic,
            ]}
            accessibilityLabel={recording ? "Stop recording" : "Record voice memo"}
          >
            {recording ? (
              <ActivityIndicator size="small" color={C.red} />
            ) : (
              <Text style={styles.micIcon}>🎙️</Text>
            )}
          </Pressable>
        )}
      </View>

      {/* ── Capture row: Video (greyed) · Photo · Audio ── */}
      <View style={styles.captureRow}>
        <Pressable
          onPress={() => onVideoTap?.()}
          disabled={true} // Video is intentionally greyed for now —
          //                 native recording isn't wired yet.
          style={[styles.captureBtn, styles.captureBtnDisabled]}
          accessibilityLabel="Video (coming soon)"
        >
          <Text style={[styles.captureIcon, styles.captureIconDisabled]}>🎥</Text>
          <Text style={[styles.captureLabel, styles.captureLabelDisabled]}>
            Video
          </Text>
        </Pressable>

        <Pressable
          onPress={onPhotoTap}
          style={styles.captureBtn}
          accessibilityLabel="Take photo"
        >
          <Text style={styles.captureIcon}>📷</Text>
          <Text style={styles.captureLabel}>Photo</Text>
        </Pressable>

        <Pressable
          onPress={handleAudioTap}
          style={[styles.captureBtn, recording && styles.captureBtnRecording]}
          accessibilityLabel={recording ? "Stop recording" : "Record audio"}
        >
          {recording ? (
            <ActivityIndicator size="small" color={C.red} style={{ marginBottom: 2 }} />
          ) : (
            <Text style={styles.captureIcon}>🎵</Text>
          )}
          <Text style={[styles.captureLabel, recording && { color: C.red }]}>
            {recording ? "Stop" : "Audio"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 18,
    backgroundColor: C.bg,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },

  messageRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  // Shared style for the two leading buttons (location + scene). Same shape
  // and accent tint so they read as a paired action group on the left.
  leadingBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: C.accent + "1A",
    borderWidth: 1,
    borderColor: C.accent + "55",
    alignItems: "center",
    justifyContent: "center",
  },
  leadingIcon: { fontSize: 18 },

  inputWrap: {
    flex: 1,
    backgroundColor: C.raised,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: 24,
    paddingHorizontal: 14,
    paddingVertical: 4,
    minHeight: 46,
    justifyContent: "center",
  },
  input: {
    color: C.text,
    fontSize: 15,
    maxHeight: 100,
    paddingVertical: 4,
  },

  sendBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: C.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  // While there's nothing to send, the trailing button flips to a voice-memo
  // mic — visually distinct from "send disabled" so it reads as an active
  // affordance rather than a greyed-out send button.
  sendBtnMic: {
    backgroundColor: C.accent + "1A",
    borderWidth: 1,
    borderColor: C.accent + "66",
  },
  sendBtnRecording: {
    backgroundColor: C.red + "1A",
    borderWidth: 1,
    borderColor: C.red,
  },
  sendBtnIdle: {
    backgroundColor: C.accent + "55",
    opacity: 0.6,
  },
  sendIcon: { fontSize: 18, color: "#fff", fontWeight: "700" },
  micIcon: { fontSize: 20 },

  captureRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 10,
  },
  captureBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: C.raised,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  captureBtnDisabled: { opacity: 0.4 },
  captureBtnRecording: {
    backgroundColor: C.red + "14",
    borderColor: C.red + "55",
  },
  captureIcon: { fontSize: 22, color: C.accent },
  captureIconDisabled: { color: C.muted },
  captureLabel: { fontSize: 12, color: C.text, fontWeight: "600" },
  captureLabelDisabled: { color: C.muted },

  recordingBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    marginBottom: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: C.red + "14",
    borderColor: C.red + "44",
    borderWidth: 1,
    borderRadius: 18,
  },
  redDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.red },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: C.red + "14",
    borderWidth: 1,
    borderColor: C.red + "44",
  },
});
