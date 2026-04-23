import React, { useEffect, useRef, useState } from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Image,
} from "react-native";
import { useAudioRecorder } from "expo-audio";
import * as ImagePicker from "expo-image-picker";
import { C } from "@/constants/theme";
import { usePeople, Person } from "@/people/PeopleStore";
import { enrollVoiceSample } from "@/people/voiceId";
import { enrollFace } from "@/people/faceId";
import { detectAndEmbedFaces } from "../../modules/face-embedding";
import {
  ensureRecordingPermission,
  VOICE_RECORDING_PRESET,
} from "@/services/audio";
import { CONFIG } from "@/constants/config";

interface Props {
  visible: boolean;
  personId: string | null;
  onClose: () => void;
}

type Phase = "idle" | "recording" | "processing" | "error";

export function PersonEnrollModal({ visible, personId, onClose }: Props) {
  const person = usePeople((s) => (personId ? s.byId[personId] : undefined));

  const [voicePhase, setVoicePhase] = useState<Phase>("idle");
  const [voiceElapsed, setVoiceElapsed] = useState(0);
  const [facePhase, setFacePhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [lastFacePreview, setLastFacePreview] = useState<string | null>(null);
  const [justCommittedVoice, setJustCommittedVoice] = useState(false);
  const [justCommittedFace, setJustCommittedFace] = useState(false);

  const recorder = useAudioRecorder(VOICE_RECORDING_PRESET);
  const recorderRef = useRef(recorder);
  recorderRef.current = recorder;
  const voiceTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Reset on open
  useEffect(() => {
    if (visible) {
      setVoicePhase("idle");
      setFacePhase("idle");
      setVoiceElapsed(0);
      setError(null);
      setLastFacePreview(null);
      setJustCommittedVoice(false);
      setJustCommittedFace(false);
    }
  }, [visible, personId]);

  // Cleanup recording timer on unmount
  useEffect(() => {
    return () => {
      if (voiceTimerRef.current) clearInterval(voiceTimerRef.current);
    };
  }, []);

  if (!person) return null;

  const samplesCollected = person.pendingVoiceSamples?.length ?? 0;
  const voiceCommitted = !!person.voiceEmbedding;
  const faceCommitted = !!person.faceEmbedding;

  const startVoice = async () => {
    setError(null);
    const granted = await ensureRecordingPermission();
    if (!granted) {
      setError("Mic permission denied. Enable in Android Settings → Apps → Eli Bridge → Permissions.");
      return;
    }
    try {
      await recorderRef.current.prepareToRecordAsync();
      recorderRef.current.record();
      setVoicePhase("recording");
      setVoiceElapsed(0);
      voiceTimerRef.current = setInterval(() => {
        setVoiceElapsed((e) => e + 1);
      }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Recording failed");
      setVoicePhase("error");
    }
  };

  const stopVoice = async () => {
    if (voiceTimerRef.current) {
      clearInterval(voiceTimerRef.current);
      voiceTimerRef.current = null;
    }
    try {
      await recorderRef.current.stop();
      const uri = recorderRef.current.uri;
      if (!uri) throw new Error("Recording ended without a file");

      setVoicePhase("processing");
      const result = await enrollVoiceSample(person.id, uri);
      setVoicePhase("idle");
      setVoiceElapsed(0);
      if (result.committed) {
        setJustCommittedVoice(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Voice enrollment failed");
      setVoicePhase("error");
    }
  };

  const handleVoiceTap = () => {
    if (voicePhase === "recording") stopVoice();
    else if (voicePhase === "idle" || voicePhase === "error") startVoice();
  };

  const processFaceImage = async (uri: string) => {
    setError(null);
    setLastFacePreview(uri);
    setFacePhase("processing");
    try {
      const detections = await detectAndEmbedFaces(uri);
      if (detections.length === 0) {
        setError("No face detected in that photo. Try a well-lit, front-facing shot.");
        setFacePhase("error");
        return;
      }
      // If multiple faces, pick the largest (biggest bbox area) — most likely the subject
      const best = detections.reduce((a, b) =>
        b.bbox.width * b.bbox.height > a.bbox.width * a.bbox.height ? b : a
      );
      enrollFace(person.id, best.embedding);
      setFacePhase("idle");
      setJustCommittedFace(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Face enrollment failed");
      setFacePhase("error");
    }
  };

  const handleTakePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      setError("Camera permission denied.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.85,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets[0]?.uri) {
      await processFaceImage(result.assets[0].uri);
    }
  };

  const handlePickPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError("Photo library permission denied.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.85,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets[0]?.uri) {
      await processFaceImage(result.assets[0].uri);
    }
  };

  const voiceLabel = (() => {
    if (voicePhase === "recording") return `Stop (${voiceElapsed}s)`;
    if (voicePhase === "processing") return "Processing…";
    if (voiceCommitted) return "Re-record voice";
    if (samplesCollected > 0) return `Record sample ${samplesCollected + 1} of ${CONFIG.VOICE_ENROLLMENT_SAMPLES}`;
    return `Record first voice sample`;
  })();

  const voiceStatusLine = voiceCommitted
    ? `✓ Voice fully enrolled`
    : samplesCollected > 0
    ? `Collected ${samplesCollected} of ${CONFIG.VOICE_ENROLLMENT_SAMPLES} samples`
    : `No voice samples yet`;

  const faceStatusLine = faceCommitted
    ? `✓ Face enrolled`
    : `No face enrolled`;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <View style={styles.header}>
          <Pressable onPress={onClose} style={styles.closeBtn}>
            <Text style={{ color: C.muted, fontSize: 20 }}>✕</Text>
          </Pressable>
          <View style={{ flex: 1, alignItems: "center" }}>
            <Text style={styles.title}>Enroll {person.name}</Text>
            {person.relationship ? (
              <Text style={styles.subtitle}>{person.relationship}</Text>
            ) : null}
          </View>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, gap: 24 }}>
          <Text style={styles.helperHeader}>
            Add voice samples and a face photo for {person.name}. These stay on-device and
            are not sent to Eli — they're used only for on-device identification in future sessions.
          </Text>

          {/* ── Voice section ─────────────────────────────────────── */}
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionIcon}>🎙️</Text>
              <Text style={styles.sectionTitle}>Voice</Text>
            </View>
            <Text style={styles.sectionStatus}>{voiceStatusLine}</Text>
            {justCommittedVoice && (
              <Text style={styles.successNote}>
                ✓ Third sample received — voice embedding committed.
              </Text>
            )}
            <Text style={styles.hint}>
              Tap to start, speak a natural sentence for 3–5 seconds, tap to stop.
              Three samples are averaged into the committed embedding.
            </Text>
            <Pressable
              onPress={handleVoiceTap}
              disabled={voicePhase === "processing"}
              style={[
                styles.actionBtn,
                voicePhase === "recording" && { backgroundColor: C.red + "26", borderColor: C.red },
                voicePhase === "processing" && { opacity: 0.5 },
              ]}
            >
              {voicePhase === "processing" ? (
                <ActivityIndicator size="small" color={C.accent} />
              ) : null}
              <Text
                style={[
                  styles.actionBtnText,
                  voicePhase === "recording" && { color: C.red, fontWeight: "700" },
                ]}
              >
                {voiceLabel}
              </Text>
            </Pressable>
          </View>

          {/* ── Face section ──────────────────────────────────────── */}
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionIcon}>🧑</Text>
              <Text style={styles.sectionTitle}>Face</Text>
            </View>
            <Text style={styles.sectionStatus}>{faceStatusLine}</Text>
            {justCommittedFace && (
              <Text style={styles.successNote}>
                ✓ Face embedding saved.
              </Text>
            )}
            {lastFacePreview && (
              <Image source={{ uri: lastFacePreview }} style={styles.preview} />
            )}
            <Text style={styles.hint}>
              One clear, front-facing photo is enough. Multi-face photos — we take
              the largest face (assumed subject).
            </Text>
            <View style={styles.faceBtnRow}>
              <Pressable
                onPress={handleTakePhoto}
                disabled={facePhase === "processing"}
                style={[styles.actionBtn, { flex: 1 }, facePhase === "processing" && { opacity: 0.5 }]}
              >
                <Text style={styles.actionBtnText}>📷 Take photo</Text>
              </Pressable>
              <Pressable
                onPress={handlePickPhoto}
                disabled={facePhase === "processing"}
                style={[styles.actionBtn, { flex: 1 }, facePhase === "processing" && { opacity: 0.5 }]}
              >
                <Text style={styles.actionBtnText}>🖼️ From library</Text>
              </Pressable>
            </View>
            {facePhase === "processing" && (
              <View style={styles.processingRow}>
                <ActivityIndicator size="small" color={C.accent} />
                <Text style={{ color: C.accent, fontSize: 12 }}>Detecting face…</Text>
              </View>
            )}
          </View>

          {error && (
            <View style={styles.errorBanner}>
              <Text style={{ color: C.red, fontSize: 12 }}>⚠ {error}</Text>
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingTop: 52,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  closeBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 16, fontWeight: "700", color: C.text },
  subtitle: { fontSize: 11, color: C.muted, marginTop: 2 },
  helperHeader: {
    fontSize: 12,
    color: C.textDim,
    lineHeight: 18,
  },
  section: {
    backgroundColor: C.raised,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
    padding: 16,
    gap: 10,
  },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sectionIcon: { fontSize: 18 },
  sectionTitle: { fontSize: 14, fontWeight: "700", color: C.text },
  sectionStatus: { fontSize: 12, color: C.textDim },
  successNote: { fontSize: 12, color: C.green, fontWeight: "600" },
  hint: { fontSize: 11, color: C.muted, lineHeight: 16 },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.accent + "44",
    backgroundColor: C.accent + "12",
  },
  actionBtnText: { fontSize: 13, color: C.accent, fontWeight: "600" },
  faceBtnRow: { flexDirection: "row", gap: 8 },
  preview: {
    width: "100%",
    height: 180,
    borderRadius: 10,
    backgroundColor: C.bg,
  },
  processingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  errorBanner: {
    padding: 10,
    borderRadius: 10,
    backgroundColor: C.red + "14",
    borderWidth: 1,
    borderColor: C.red + "44",
  },
});
