import React from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { C } from "@/constants/theme";
import { useRecovery, RecoveryStep } from "@/stores/recoveryStore";

/**
 * Timeout-recovery popup. When a pipeline step (Gemini / Kindroid /
 * ElevenLabs) fails transiently, recoveryStore surfaces a failure and this
 * modal interrupts with two choices: resubmit just that step, or cancel
 * the whole in-flight message.
 *
 * Mounted at the layout root so it overlays every screen, including the
 * Driving Mode overlay.
 */

const STEP_LABEL: Record<RecoveryStep, string> = {
  gemini: "Building the emote",
  kindroid: "Sending to Eli",
  elevenlabs: "Generating Eli's voice",
};

const STEP_DETAIL: Record<RecoveryStep, string> = {
  gemini: "Gemini timed out assembling the scene.",
  kindroid: "Kindroid timed out relaying your message to Eli.",
  elevenlabs: "ElevenLabs timed out generating the audio.",
};

const STEP_RESUBMIT_NOTE: Record<RecoveryStep, string> = {
  gemini: "Resubmit rebuilds the emote and continues.",
  kindroid:
    "Resubmit re-sends to Eli. (If Eli already received it, he may see it twice.)",
  elevenlabs: "Resubmit regenerates the audio. Your message already reached Eli.",
};

export function RecoveryPopup() {
  const failure = useRecovery((s) => s.failure);
  const retrying = useRecovery((s) => s.retrying);
  const resubmit = useRecovery((s) => s.resubmit);
  const cancel = useRecovery((s) => s.cancel);

  return (
    <Modal
      visible={failure !== null}
      transparent
      animationType="fade"
      onRequestClose={() => {
        /* require an explicit choice — back press does nothing */
      }}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          {failure ? (
            <>
              <Text style={styles.stepTag}>⚠ {STEP_LABEL[failure.step]}</Text>
              <Text style={styles.title}>This step timed out</Text>
              <Text style={styles.detail}>{STEP_DETAIL[failure.step]}</Text>
              <Text style={styles.resubmitNote}>
                {STEP_RESUBMIT_NOTE[failure.step]}
              </Text>

              <View style={styles.errorBox}>
                <Text style={styles.errorText} numberOfLines={3}>
                  {failure.message}
                </Text>
              </View>

              <View style={styles.actions}>
                <Pressable
                  onPress={cancel}
                  disabled={retrying}
                  style={[styles.btn, styles.cancelBtn, retrying && { opacity: 0.4 }]}
                >
                  <Text style={styles.cancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={() => resubmit()}
                  disabled={retrying}
                  style={[styles.btn, styles.resubmitBtn, retrying && { opacity: 0.6 }]}
                >
                  {retrying ? (
                    <ActivityIndicator size="small" color={C.accent} />
                  ) : (
                    <Text style={styles.resubmitText}>↻ Resubmit step</Text>
                  )}
                </Pressable>
              </View>

              <Text style={styles.cancelHint}>
                Cancel clears this message and readies a fresh one.
              </Text>
            </>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
  },
  card: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: C.raised,
    borderWidth: 1,
    borderColor: C.amber + "55",
    borderRadius: 16,
    padding: 20,
  },
  stepTag: {
    fontSize: 11,
    color: C.amber,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 6,
  },
  title: { fontSize: 17, fontWeight: "700", color: C.text, marginBottom: 6 },
  detail: { fontSize: 13, color: C.textDim, lineHeight: 19, marginBottom: 6 },
  resubmitNote: {
    fontSize: 11,
    color: C.muted,
    lineHeight: 16,
    marginBottom: 12,
    fontStyle: "italic",
  },
  errorBox: {
    backgroundColor: C.surface,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 16,
  },
  errorText: { fontSize: 11, color: C.red, lineHeight: 15 },
  actions: { flexDirection: "row", gap: 10 },
  btn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtn: { backgroundColor: C.surface, borderColor: C.border },
  cancelText: { color: C.textDim, fontSize: 13, fontWeight: "600" },
  resubmitBtn: {
    backgroundColor: C.accent + "22",
    borderColor: C.accent + "66",
  },
  resubmitText: { color: C.accent, fontSize: 13, fontWeight: "700" },
  cancelHint: {
    fontSize: 10,
    color: C.muted,
    textAlign: "center",
    marginTop: 10,
  },
});
