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
  onAttachTap: () => void;
  pickerOpen?: boolean;
}

export function InputBar({ onAttachTap, pickerOpen }: Props) {
  const [text, setText] = useState("");
  const [recording, setRecording] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const recorder = useAudioRecorder(VOICE_RECORDING_PRESET);
  const recorderRef = useRef(recorder);
  recorderRef.current = recorder;

  const pending = useChat((s) => s.pending);
  const addAttachment = useChat((s) => s.addAttachment);
  const sendMessage = useChat((s) => s.sendMessage);

  useEffect(() => {
    setupBridgeAudioMode();
  }, []);

  const hasSend = text.trim().length > 0 || pending.length > 0;

  const handleSend = async () => {
    if (!hasSend) return;
    const t = text.trim();
    setText("");
    await sendMessage(t);
  };

  const handleMicTap = async () => {
    if (recording) {
      // Stop recording and stage the audio file
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

    // Start recording
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
          <Text style={{ fontSize: 12, color: C.red }}>Recording… tap 🎙️ to stop</Text>
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
      <View style={styles.bar}>
        <Pressable
          onPress={onAttachTap}
          style={[
            styles.circleBtn,
            {
              backgroundColor: pickerOpen ? C.accentDim : "transparent",
              borderColor: pickerOpen ? C.accent : C.border,
            },
          ]}
        >
          <Text style={{ fontSize: 20, color: pickerOpen ? C.accent : C.textDim, fontWeight: "300" }}>+</Text>
        </Pressable>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Message Eli…"
          placeholderTextColor={C.muted}
          multiline
          style={styles.input}
        />
        {hasSend ? (
          <Pressable onPress={handleSend} style={[styles.sendBtn, { backgroundColor: C.accent }]}>
            <Text style={{ fontSize: 18, color: "#fff" }}>↑</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={handleMicTap}
            style={[
              styles.sendBtn,
              {
                backgroundColor: recording ? C.red + "22" : "transparent",
                borderWidth: 1.5,
                borderColor: recording ? C.red : C.border,
              },
            ]}
          >
            {recording ? (
              <ActivityIndicator size="small" color={C.red} />
            ) : (
              <Text style={{ fontSize: 18 }}>🎙️</Text>
            )}
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 24,
    backgroundColor: C.bg,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: C.raised,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: 28,
    paddingLeft: 14,
    paddingRight: 6,
    paddingVertical: 6,
  },
  circleBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  input: {
    flex: 1,
    color: C.text,
    fontSize: 16,
    maxHeight: 100,
    paddingVertical: 4,
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
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
