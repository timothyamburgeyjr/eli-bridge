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

// Hard caps on video capture. 480p keeps file size manageable for inline
// upload to Gemini Flash (rule of thumb: ~1MB per second at 480p). 15s
// max duration keeps the file under ~15-20MB which is well within Gemini's
// inline content limit. Anything longer would need the Files API path.
const VIDEO_QUALITY = "480p" as const;
const VIDEO_MAX_DURATION_SEC = 15;

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
  const [facing, setFacing] = useState<"back" | "front">("back");
  const [videoRecording, setVideoRecording] = useState(false);
  const [videoElapsed, setVideoElapsed] = useState(0);
  const videoTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
      setVideoRecording(false);
      setVideoElapsed(0);
      setBusy(false);
      setFacing("back"); // always start on rear-cam; flip is per-session
    }
  }, [visible, initialMode]);

  useEffect(() => {
    return () => {
      if (audioTimerRef.current) clearInterval(audioTimerRef.current);
      if (videoTimerRef.current) clearInterval(videoTimerRef.current);
    };
  }, []);

  const needsCamera = mode === "photo" || mode === "scene" || mode === "video";
  // Video and AudioSnap-paired photo both need the mic. Audio-only obviously
  // does too. Scene mode is camera-only (no AudioSnap by design).
  const needsMic = mode === "audio" || mode === "photo" || mode === "video";

  // Request permissions once per mode toggle when missing. Omit the
  // request* function refs from deps — their identities change on every
  // render, which previously re-fired this effect constantly and caused
  // the CameraView below to remount (visible as screen flicker) whenever
  // the permission hook's internal state churned.
  useEffect(() => {
    if (!visible) return;
    if (needsCamera && !cameraPerm?.granted) {
      requestCameraPerm();
    }
    if (needsMic && !micPerm?.granted) {
      requestMicPerm();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, needsCamera, needsMic, cameraPerm?.granted, micPerm?.granted]);

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

      if (mode === "photo") {
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

  // ── Video record / stop ───────────────────────────────────────────
  //
  // expo-camera's recordAsync resolves with the file URI once recording
  // ends — either via stopRecording() OR when maxDuration elapses. We
  // store the awaiter as a Promise here so the Stop tap can call
  // stopRecording() without needing to know the resolve callback.
  const handleVideoTap = async () => {
    if (!cameraRef.current || busy) return;

    if (videoRecording) {
      // Stop in progress — recordAsync's promise (set in the start branch)
      // will resolve with the URI, and the duration timer is cleared there.
      try {
        cameraRef.current.stopRecording();
      } catch (err) {
        console.warn("[video] stopRecording threw:", err);
      }
      return;
    }

    setBusy(true);
    try {
      setVideoRecording(true);
      setVideoElapsed(0);
      videoTimerRef.current = setInterval(() => {
        setVideoElapsed((n) => {
          // Auto-stop at the max — recordAsync ALSO honors maxDuration
          // but the UI counter shouldn't visually keep climbing past it.
          if (n + 1 >= VIDEO_MAX_DURATION_SEC) {
            try {
              cameraRef.current?.stopRecording();
            } catch {
              // already stopped
            }
          }
          return n + 1;
        });
      }, 1000);

      const result = await cameraRef.current.recordAsync({
        maxDuration: VIDEO_MAX_DURATION_SEC,
      });

      if (videoTimerRef.current) clearInterval(videoTimerRef.current);
      videoTimerRef.current = null;
      setVideoRecording(false);

      if (result?.uri) {
        addAttachment({
          kind: "video",
          localPath: result.uri,
          mimeType: "video/mp4",
          duration: videoElapsed || 1,
        });
        onClose();
      }
    } catch (err) {
      console.warn("[video] recordAsync failed:", err);
      if (videoTimerRef.current) clearInterval(videoTimerRef.current);
      videoTimerRef.current = null;
      setVideoRecording(false);
    } finally {
      setBusy(false);
    }
  };

  // ── Scene: finalize captured photos + note ────────────────────────
  // Fire-and-forget: close the modal immediately so the user isn't staring
  // at a frozen screen while Gemini Pro chews on the images (2-10s). The
  // existing scene-status banner in app/index.tsx surfaces progress via
  // chatStore.sceneStatus, and the card appears in the stream when the
  // capture completes. Previously this awaited captureScene inline which
  // could leave the modal stuck when Gemini was slow, forcing a back-press
  // that dismissed the UI but didn't cancel the in-flight request.
  const handleSceneDone = () => {
    if (capturedPhotos.length === 0) return;
    const photos = capturedPhotos.map((p) => p.uri);
    const note = sceneNote.trim() || undefined;
    onClose();
    captureScene(photos, note);
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
            // Stable key so RN doesn't tear down + remount the native camera
            // surface when parent state churns (flashing, busy, etc). Before
            // adding this, brief camera flicker was reported when the
            // permission useEffect re-fired mid-session.
            //
            // mode flips between "picture" (default for photo/scene) and
            // "video" (engages the audio session + video-capable surface).
            // facing flips between back and front via the overlay button.
            // CameraView handles the swap natively without a remount.
            //
            // The mode flag DOES cause a surface swap when toggled, so a
            // mid-recording mode change would be bad — but video recording
            // disables the mode-tabs row so that can't happen.
            <>
              <CameraView
                key={`capture-camera-${mode === "video" ? "video" : "picture"}`}
                ref={cameraRef}
                style={styles.camera}
                facing={facing}
                mode={mode === "video" ? "video" : "picture"}
                videoQuality={mode === "video" ? VIDEO_QUALITY : undefined}
              />
              {mode === "video" && videoRecording ? (
                <View style={styles.recordingBadge} pointerEvents="none">
                  <View style={styles.recordingDot} />
                  <Text style={styles.recordingBadgeText}>
                    {formatTime(videoElapsed)} / 0:{String(VIDEO_MAX_DURATION_SEC).padStart(2, "0")}
                  </Text>
                </View>
              ) : null}
            </>
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

        {/* Mode tabs — disabled while recording video so we can't surface-
            swap mid-record (would corrupt the recording). */}
        <View style={styles.modeRow}>
          {(["photo", "video", "audio", "scene"] as CaptureMode[]).map((m) => (
            <Pressable
              key={m}
              onPress={() => {
                if (videoRecording || audioRecording) return;
                setMode(m);
              }}
              style={[
                styles.modeTab,
                mode === m ? { borderBottomColor: C.accent } : null,
                (videoRecording || audioRecording) && mode !== m ? { opacity: 0.35 } : null,
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
          ) : mode === "video" ? (
            <Pressable
              onPress={handleVideoTap}
              disabled={busy && !videoRecording}
              style={[
                styles.shutter,
                videoRecording ? { borderColor: C.red } : null,
                busy && !videoRecording ? { opacity: 0.5 } : null,
              ]}
              accessibilityLabel={videoRecording ? "Stop video recording" : "Start video recording"}
            >
              <View
                style={{
                  width: videoRecording ? 26 : 56,
                  height: videoRecording ? 26 : 56,
                  borderRadius: videoRecording ? 4 : 28,
                  backgroundColor: videoRecording ? C.red : C.red,
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

          {needsCamera && cameraPerm?.granted ? (
            <Pressable
              onPress={() => setFacing((f) => (f === "back" ? "front" : "back"))}
              disabled={busy}
              style={[styles.smallBtn, busy && { opacity: 0.4 }]}
              hitSlop={8}
            >
              <Text style={styles.flipBtnText}>🔄</Text>
            </Pressable>
          ) : (
            <View style={styles.smallBtn} />
          )}
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
  flipBtnText: { fontSize: 22 },
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
  recordingBadge: {
    position: "absolute",
    top: 16,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: 1,
    borderColor: C.red + "88",
  },
  recordingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.red },
  recordingBadgeText: { color: "#fff", fontSize: 12, fontWeight: "700" },
});
