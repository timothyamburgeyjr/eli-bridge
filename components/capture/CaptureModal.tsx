import React, { useEffect, useRef, useState } from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  TextInput,
  StyleSheet,
  Image,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import {
  CameraView,
  useCameraPermissions,
  useMicrophonePermissions,
} from "expo-camera";
import { useAudioRecorder } from "expo-audio";
import { C } from "@/constants/theme";
import { useChat } from "@/stores/chatStore";
import {
  ensureRecordingPermission,
  VOICE_RECORDING_PRESET,
  AUDIOSNAP_DURATION_SEC,
} from "@/services/audio";

export type CaptureMode = "photo" | "video" | "audio" | "scene";

interface Props {
  visible: boolean;
  initialMode: CaptureMode;
  onClose: () => void;
}

interface CapturedPhoto {
  uri: string;
}

export function CaptureModal({ visible, initialMode, onClose }: Props) {
  const [mode, setMode] = useState<CaptureMode>(initialMode);
  const [cameraPerm, requestCameraPerm] = useCameraPermissions();
  const [micPerm, requestMicPerm] = useMicrophonePermissions();
  const cameraRef = useRef<CameraView>(null);

  const [capturedPhotos, setCapturedPhotos] = useState<CapturedPhoto[]>([]);
  const [sceneNote, setSceneNote] = useState("");
  const [audioRecording, setAudioRecording] = useState(false);
  const [audioElapsed, setAudioElapsed] = useState(0);
  const audioTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [flashing, setFlashing] = useState(false);
  const [busy, setBusy] = useState(false);

  const recorder = useAudioRecorder(VOICE_RECORDING_PRESET);
  const recorderRef = useRef(recorder);
  recorderRef.current = recorder;

  const addAttachment = useChat((s) => s.addAttachment);
  const captureScene = useChat((s) => s.captureScene);

  // Reset state on open/mode change
  useEffect(() => {
    if (visible) {
      setMode(initialMode);
      setCapturedPhotos([]);
      setSceneNote("");
      setAudioRecording(false);
      setAudioElapsed(0);
      setBusy(false);
    }
  }, [visible, initialMode]);

  useEffect(() => {
    return () => {
      if (audioTimerRef.current) clearInterval(audioTimerRef.current);
    };
  }, []);

  const needsCamera = mode === "photo" || mode === "video" || mode === "scene";
  const needsMic = mode === "audio" || mode === "photo" || mode === "video";

  useEffect(() => {
    if (!visible) return;
    if (needsCamera && !cameraPerm?.granted) {
      requestCameraPerm();
    }
    if (needsMic && !micPerm?.granted) {
      requestMicPerm();
    }
  }, [visible, needsCamera, needsMic, cameraPerm?.granted, micPerm?.granted, requestCameraPerm, requestMicPerm]);

  // ── Photo + AudioSnap ─────────────────────────────────────────────
  const handlePhotoShutter = async () => {
    if (!cameraRef.current || busy) return;
    setBusy(true);
    setFlashing(true);
    setTimeout(() => setFlashing(false), 130);

    try {
      // Start 5-sec AudioSnap if mic perm available
      let audioStarted = false;
      if (micPerm?.granted) {
        try {
          await recorderRef.current.prepareToRecordAsync();
          recorderRef.current.record({ forDuration: AUDIOSNAP_DURATION_SEC });
          audioStarted = true;
        } catch {
          // AudioSnap failure shouldn't kill the photo
        }
      }

      const picture = await cameraRef.current.takePictureAsync({ quality: 0.85 });
      if (picture?.uri) {
        if (mode === "scene") {
          setCapturedPhotos((prev) => [...prev, { uri: picture.uri }]);
        } else {
          addAttachment({
            kind: "image",
            localPath: picture.uri,
            mimeType: "image/jpeg",
          });
        }
      }

      // Wait for AudioSnap to finish (forDuration auto-stops)
      if (audioStarted && mode === "photo") {
        await new Promise((r) => setTimeout(r, (AUDIOSNAP_DURATION_SEC + 0.5) * 1000));
        const uri = recorderRef.current.uri;
        if (uri) {
          addAttachment({
            kind: "audio",
            localPath: uri,
            mimeType: "audio/mp4",
            duration: AUDIOSNAP_DURATION_SEC,
          });
        }
      }

      if (mode === "photo" || mode === "video") {
        // Photo mode: close after successful shot (scene mode stays open for more shots)
        onClose();
      }
    } catch (err) {
      console.warn("Photo capture failed", err);
    } finally {
      setBusy(false);
    }
  };

  // ── Audio-only ────────────────────────────────────────────────────
  const handleAudioTap = async () => {
    if (audioRecording) {
      if (audioTimerRef.current) clearInterval(audioTimerRef.current);
      audioTimerRef.current = null;
      try {
        await recorderRef.current.stop();
        const uri = recorderRef.current.uri;
        if (uri) {
          addAttachment({
            kind: "audio",
            localPath: uri,
            mimeType: "audio/mp4",
            duration: audioElapsed,
          });
        }
      } finally {
        setAudioRecording(false);
        onClose();
      }
      return;
    }

    const granted = await ensureRecordingPermission();
    if (!granted) return;
    try {
      await recorderRef.current.prepareToRecordAsync();
      recorderRef.current.record();
      setAudioRecording(true);
      setAudioElapsed(0);
      audioTimerRef.current = setInterval(() => {
        setAudioElapsed((n) => n + 1);
      }, 1000);
    } catch (err) {
      console.warn("Audio recording failed", err);
    }
  };

  // ── Scene: finalize captured photos + note ────────────────────────
  const handleSceneDone = async () => {
    if (capturedPhotos.length === 0) return;
    setBusy(true);
    try {
      await captureScene(
        capturedPhotos.map((p) => p.uri),
        sceneNote.trim() || undefined
      );
    } finally {
      setBusy(false);
      onClose();
    }
  };

  const removePhoto = (idx: number) => {
    setCapturedPhotos((prev) => prev.filter((_, i) => i !== idx));
  };

  // ── Render ────────────────────────────────────────────────────────
  const showCamera = needsCamera && cameraPerm?.granted;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        {flashing && <View style={styles.flash} />}

        {/* Main viewport */}
        <View style={styles.viewport}>
          {mode === "audio" ? (
            <View style={styles.audioView}>
              <Text style={{ fontSize: 72, color: audioRecording ? C.red : C.muted }}>🎙️</Text>
              <Text style={styles.audioTime}>
                {audioRecording ? formatTime(audioElapsed) : "Tap below to record"}
              </Text>
            </View>
          ) : showCamera ? (
            <CameraView ref={cameraRef} style={styles.camera} facing="back" />
          ) : (
            <View style={styles.permView}>
              <Text style={styles.permText}>
                {!cameraPerm?.granted && needsCamera && "Camera permission needed. "}
                {!micPerm?.granted && needsMic && "Mic permission needed. "}
                Tap to grant.
              </Text>
              <Pressable
                onPress={async () => {
                  if (needsCamera) await requestCameraPerm();
                  if (needsMic) await requestMicPerm();
                }}
                style={styles.permBtn}
              >
                <Text style={{ color: C.accent, fontSize: 13, fontWeight: "600" }}>Grant permissions</Text>
              </Pressable>
            </View>
          )}
        </View>

        {/* Scene mode bottom UI */}
        {mode === "scene" ? (
          <View style={styles.sceneFooter}>
            {capturedPhotos.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                {capturedPhotos.map((p, i) => (
                  <Pressable key={i} onPress={() => removePhoto(i)}>
                    <Image source={{ uri: p.uri }} style={styles.sceneThumb} />
                    <View style={styles.removeBadge}>
                      <Text style={{ color: "#fff", fontSize: 10, fontWeight: "700" }}>×</Text>
                    </View>
                  </Pressable>
                ))}
              </ScrollView>
            ) : (
              <Text style={styles.sceneHint}>Snap 1–3 photos to ground the scene</Text>
            )}

            <TextInput
              value={sceneNote}
              onChangeText={setSceneNote}
              placeholder="Optional note — 'making coffee, Luna behind me'"
              placeholderTextColor={C.muted}
              style={styles.sceneInput}
            />
          </View>
        ) : null}

        {/* Mode tabs */}
        <View style={styles.modeRow}>
          {(["photo", "video", "audio", "scene"] as CaptureMode[]).map((m) => (
            <Pressable
              key={m}
              onPress={() => setMode(m)}
              style={[
                styles.modeTab,
                mode === m ? { borderBottomColor: C.accent } : null,
              ]}
            >
              <Text style={{ fontSize: 18 }}>{ICON[m]}</Text>
              <Text style={{ fontSize: 10, color: mode === m ? C.accent : C.muted, marginTop: 2, fontWeight: mode === m ? "700" : "400" }}>
                {LABEL[m]}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Controls */}
        <View style={styles.controls}>
          <Pressable onPress={onClose} style={styles.smallBtn}>
            <Text style={{ fontSize: 20, color: C.muted }}>✕</Text>
          </Pressable>

          {mode === "audio" ? (
            <Pressable
              onPress={handleAudioTap}
              style={[
                styles.shutter,
                audioRecording ? { borderColor: C.red } : null,
              ]}
            >
              <View
                style={{
                  width: audioRecording ? 26 : 56,
                  height: audioRecording ? 26 : 56,
                  borderRadius: audioRecording ? 4 : 28,
                  backgroundColor: audioRecording ? C.red : "#fff",
                }}
              />
            </Pressable>
          ) : mode === "scene" ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
              <Pressable
                onPress={handlePhotoShutter}
                disabled={busy || capturedPhotos.length >= 3}
                style={[styles.shutter, (busy || capturedPhotos.length >= 3) ? { opacity: 0.4 } : null]}
              >
                <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: "#fff" }} />
              </Pressable>
              <Pressable
                onPress={handleSceneDone}
                disabled={capturedPhotos.length === 0 || busy}
                style={[
                  styles.confirmBtn,
                  capturedPhotos.length === 0 ? { opacity: 0.4 } : null,
                ]}
              >
                {busy ? (
                  <ActivityIndicator size="small" color={C.accent} />
                ) : (
                  <Text style={{ color: C.accent, fontSize: 14, fontWeight: "700" }}>
                    Set scene ✓
                  </Text>
                )}
              </Pressable>
            </View>
          ) : (
            <Pressable onPress={handlePhotoShutter} disabled={busy} style={[styles.shutter, busy ? { opacity: 0.4 } : null]}>
              <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: "#fff" }} />
            </Pressable>
          )}

          <View style={styles.smallBtn} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const ICON: Record<CaptureMode, string> = {
  photo: "📷",
  video: "🎥",
  audio: "🎙️",
  scene: "🎬",
};
const LABEL: Record<CaptureMode, string> = {
  photo: "Photo",
  video: "Video",
  audio: "Audio",
  scene: "Scene",
};

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  viewport: { flex: 1, alignItems: "center", justifyContent: "center" },
  camera: { flex: 1, width: "100%" },
  flash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#fff",
    zIndex: 100,
    opacity: 0.8,
  },
  audioView: { alignItems: "center", gap: 24 },
  audioTime: { fontSize: 20, color: C.textDim, fontWeight: "600" },
  permView: { alignItems: "center", padding: 40, gap: 14 },
  permText: { color: C.textDim, fontSize: 13, textAlign: "center", lineHeight: 20 },
  permBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: C.accent + "18",
    borderWidth: 1,
    borderColor: C.accent + "44",
  },
  sceneFooter: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "rgba(0,0,0,0.9)",
    borderTopWidth: 1,
    borderTopColor: C.border,
    gap: 8,
  },
  sceneThumb: {
    width: 56,
    height: 56,
    borderRadius: 8,
    backgroundColor: C.raised,
  },
  removeBadge: {
    position: "absolute",
    top: 2,
    right: 2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  sceneHint: { fontSize: 11, color: C.muted, fontStyle: "italic", paddingVertical: 4 },
  sceneInput: {
    backgroundColor: C.raised,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: C.text,
  },
  modeRow: {
    flexDirection: "row",
    backgroundColor: "rgba(8,9,16,0.92)",
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  modeTab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 28,
    paddingTop: 16,
    paddingBottom: 36,
    backgroundColor: "rgba(8,9,16,0.92)",
  },
  smallBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  shutter: {
    width: 74,
    height: 74,
    borderRadius: 37,
    borderWidth: 4,
    borderColor: "rgba(255,255,255,0.7)",
    alignItems: "center",
    justifyContent: "center",
  },
  confirmBtn: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 24,
    backgroundColor: C.accent + "14",
    borderWidth: 1,
    borderColor: C.accent,
  },
});
