import React from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
} from "react-native";
import { C } from "@/constants/theme";
import { MOODS } from "@/constants/moods";
import { useMood } from "@/stores/moodStore";

interface Props {
  visible: boolean;
  onClose: () => void;
}

/**
 * The mood, explained. Answers "why is my app red?" — which is the whole reason
 * `sources` exists on a MoodReading.
 */
export function MoodSheet({ visible, onClose }: Props) {
  const label = useMood((s) => s.label);
  const valence = useMood((s) => s.valence);
  const energy = useMood((s) => s.energy);
  const confidence = useMood((s) => s.confidence);
  const sources = useMood((s) => s.sources);
  const history = useMood((s) => s.history);
  const forceNeutral = useMood((s) => s.forceNeutral);

  const def = MOODS[label];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.scrim} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.grabber} />

          <View style={styles.headline}>
            <Text style={[styles.emoji, { color: def.color }]}>{def.emoji}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.mood, { color: def.color }]}>
                {cap(label)}
              </Text>
              <Text style={styles.register}>{def.register}</Text>
            </View>
          </View>

          <Meter
            label="Pleasantness"
            value={(valence + 1) / 2}
            color={def.color}
            readout={valence.toFixed(2)}
          />
          <Meter
            label="Activation"
            value={energy}
            color={def.color}
            readout={energy.toFixed(2)}
          />
          <Meter
            label="Confidence"
            value={confidence}
            color={def.color}
            readout={`${Math.round(confidence * 100)}%`}
          />

          <Text style={styles.sectionTitle}>Why</Text>
          {sources.length === 0 ? (
            <Text style={styles.empty}>
              Nothing distinctive read yet. The border stays at rest.
            </Text>
          ) : (
            sources.map((s, i) => (
              <View key={i} style={styles.sourceRow}>
                <Text style={styles.sourceDot}>·</Text>
                <Text style={styles.sourceText}>{s}</Text>
              </View>
            ))
          )}

          {history.length > 1 && (
            <>
              <Text style={styles.sectionTitle}>Recent reads</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 6, paddingVertical: 2 }}
              >
                {history
                  .slice(-8)
                  .map((r, i) => (
                    <View
                      key={i}
                      style={[
                        styles.chip,
                        {
                          borderColor: MOODS[r.label].color + "55",
                          backgroundColor: MOODS[r.label].color + "12",
                        },
                      ]}
                    >
                      <Text style={{ fontSize: 11 }}>
                        {r.origin === "sensor" ? "📡" : "✨"}
                      </Text>
                      <Text
                        style={{
                          fontSize: 10,
                          color: MOODS[r.label].color,
                          fontWeight: "700",
                        }}
                      >
                        {r.label}
                      </Text>
                    </View>
                  ))
                  .reverse()}
              </ScrollView>
            </>
          )}

          <Pressable
            onPress={() => {
              forceNeutral();
              onClose();
            }}
            style={styles.resetBtn}
          >
            <Text style={styles.resetText}>Reset to neutral</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Meter({
  label,
  value,
  color,
  readout,
}: {
  label: string;
  value: number;
  color: string;
  readout: string;
}) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <View style={styles.meterRow}>
      <Text style={styles.meterLabel}>{label}</Text>
      <View style={styles.meterTrack}>
        <View
          style={[styles.meterFill, { width: `${pct}%`, backgroundColor: color }]}
        />
      </View>
      <Text style={styles.meterReadout}>{readout}</Text>
    </View>
  );
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: "#000000B0", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 20,
    paddingBottom: 28,
    paddingTop: 8,
  },
  grabber: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.border,
    marginBottom: 16,
  },
  headline: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 18 },
  emoji: { fontSize: 30 },
  mood: { fontSize: 22, fontWeight: "800" },
  register: { color: C.muted, fontSize: 11.5, marginTop: 2 },
  meterRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  meterLabel: { color: C.textDim, fontSize: 11, width: 88 },
  meterTrack: {
    flex: 1,
    height: 5,
    borderRadius: 3,
    backgroundColor: C.raised,
    overflow: "hidden",
  },
  meterFill: { height: "100%", borderRadius: 3 },
  meterReadout: { color: C.muted, fontSize: 10, width: 42, textAlign: "right" },
  sectionTitle: {
    color: C.text,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 18,
    marginBottom: 8,
  },
  empty: { color: C.muted, fontSize: 12, fontStyle: "italic" },
  sourceRow: { flexDirection: "row", gap: 6, marginBottom: 4 },
  sourceDot: { color: C.muted, fontSize: 12 },
  sourceText: { color: C.textDim, fontSize: 12, flex: 1, lineHeight: 17 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 9,
    borderWidth: 1,
  },
  resetBtn: {
    alignSelf: "center",
    marginTop: 22,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  resetText: { color: C.textDim, fontSize: 13, fontWeight: "600" },
});
