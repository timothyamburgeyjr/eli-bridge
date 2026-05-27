import React, { useEffect, useState, useRef } from "react";
import { View, TextInput, Pressable, Text, StyleSheet, ActivityIndicator, Modal } from "react-native";
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
  /** Tap 🎬 Scene Capture (in the More menu) → CaptureModal in scene mode. */
  onSceneTap: () => void;
  /** Tap 💬 Quick Messages (in the More menu) → open the Quick Messages
   *  popup. Generates a fresh batch on first open per session. */
  onQuickMessagesTap: () => void;
  /** Tap 📷 Photo → CaptureModal in photo mode. Video is intentionally
   *  greyed for now (no native video recording yet). */
  onPhotoTap: () => void;
  onVideoTap?: () => void;
}

/**
 * Bottom input area. Two stacked rows:
 *
 *   Row 1 — message bar:
 *     📍 location pin · text input · trailing dual-mode button
 *
 *   Row 2 — capture row:
 *     🎥 Video (greyed) · 📷 Photo · ⋯ More
 *
 * Trailing button:
 *   - text/attachments present → ➤ send
 *   - empty → 🎙 voice memo (tap to start, tap to stop, stages to tray
 *     with no popup — matching the prior in-bar mic behavior)
 *
 * More menu opens a small popover above the More button with the less
 * frequently used capture options (Audio with the modal-style recorder,
 * Scene Capture). The inline voice-memo on the trailing button remains the
 * fast path; Audio in the menu is the secondary path for the same action,
 * preserved so Tim can record from the bottom row if he's already aiming
 * at the capture buttons.
 */
export function InputBar({
  onLocationTap,
  onSceneTap,
  onQuickMessagesTap,
  onPhotoTap,
  onVideoTap,
}: Props) {
  const [text, setText] = useState("");
  const [recording, setRecording] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
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
            Recording… tap the mic to stop
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

      {/* ── Message row: location · input · send/mic ── */}
      <View style={styles.messageRow}>
        <Pressable onPress={onLocationTap} style={styles.leadingBtn}>
          <Text style={styles.leadingIcon}>📍</Text>
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

      {/* ── Capture row: Video (greyed) · Photo · ⋯ More ── */}
      <View style={styles.captureRow}>
        <Pressable
          onPress={() => onVideoTap?.()}
          disabled={true}
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
          onPress={() => setMoreOpen(true)}
          style={[styles.captureBtn, moreOpen && styles.captureBtnActive]}
          accessibilityLabel="More capture options"
        >
          <Text style={styles.captureIcon}>⋯</Text>
          <Text style={styles.captureLabel}>More</Text>
        </Pressable>
      </View>

      {/* ── More popup — Audio + Scene Capture ── */}
      <Modal
        visible={moreOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMoreOpen(false)}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => setMoreOpen(false)}
        />
        <View style={styles.morePopup} pointerEvents="box-none">
          <View style={styles.moreMenu}>
            <Pressable
              onPress={() => {
                setMoreOpen(false);
                handleAudioTap();
              }}
              style={styles.moreItem}
            >
              <Text style={styles.moreItemIcon}>🎵</Text>
              <Text style={styles.moreItemLabel}>Audio</Text>
            </Pressable>
            <View style={styles.moreDivider} />
            <Pressable
              onPress={() => {
                setMoreOpen(false);
                onSceneTap();
              }}
              style={styles.moreItem}
            >
              <Text style={styles.moreItemIcon}>🎬</Text>
              <Text style={styles.moreItemLabel}>Scene Capture</Text>
            </Pressable>
            <View style={styles.moreDivider} />
            <Pressable
              onPress={() => {
                setMoreOpen(false);
                onQuickMessagesTap();
              }}
              style={styles.moreItem}
            >
              <Text style={styles.moreItemIcon}>💬</Text>
              <Text style={styles.moreItemLabel}>Quick Messages</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
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
    gap: 10,
  },
  leadingBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: C.accent + "1A",
    borderWidth: 1,
    borderColor: C.accent + "55",
    alignItems: "center",
    justifyContent: "center",
  },
  leadingIcon: { fontSize: 20 },

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
  captureBtnActive: {
    backgroundColor: C.accent + "14",
    borderColor: C.accent + "66",
  },
  captureIcon: { fontSize: 22, color: C.accent },
  captureIconDisabled: { color: C.muted },
  captureLabel: { fontSize: 12, color: C.text, fontWeight: "600" },
  captureLabelDisabled: { color: C.muted },

  // Anchored above the bottom-right capture button. Positioned absolutely
  // within the modal so the popup floats above the input area cleanly.
  morePopup: {
    position: "absolute",
    bottom: 110,
    right: 18,
  },
  moreMenu: {
    backgroundColor: C.raised,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.accent + "55",
    paddingVertical: 4,
    minWidth: 180,
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 12,
  },
  moreItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  moreItemIcon: { fontSize: 20, color: C.accent },
  moreItemLabel: { fontSize: 14, color: C.text, fontWeight: "600" },
  moreDivider: {
    height: 1,
    backgroundColor: C.border,
    marginHorizontal: 10,
  },

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
