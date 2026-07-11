import React from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
} from "react-native";
import { C } from "@/constants/theme";
import { PersonaAvatar } from "@/components/common/PersonaAvatar";
import {
  PERSONALITY_LIST,
  isAvailable,
  type PersonalityKey,
} from "@/constants/personalities";

interface Props {
  visible: boolean;
  onSelect: (key: PersonalityKey) => void;
  onCancel: () => void;
}

/**
 * Start-of-session roster. Tapping a face IS the confirm — there is no second
 * step. Personalities without a voice stay in the grid, greyed: they're family,
 * and an absent tile is more confusing than a disabled one.
 */
export function PersonalityPicker({ visible, onSelect, onCancel }: Props) {
  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onCancel}
      statusBarTranslucent
    >
      <Pressable style={styles.scrim} onPress={onCancel}>
        {/* Inner press swallows taps so they don't dismiss through the sheet. */}
        <Pressable style={styles.sheet} onPress={() => {}}>
          <Text style={styles.title}>Who are you talking to?</Text>
          <Text style={styles.sub}>
            They'll be with you until you end the session.
          </Text>

          <ScrollView
            contentContainerStyle={styles.grid}
            showsVerticalScrollIndicator={false}
          >
            {PERSONALITY_LIST.map((p) => {
              const available = isAvailable(p);
              return (
                <Pressable
                  key={p.key}
                  disabled={!available}
                  onPress={() => onSelect(p.key)}
                  style={({ pressed }) => [
                    styles.tile,
                    pressed && available && styles.tilePressed,
                  ]}
                >
                  <PersonaAvatar
                    personality={p}
                    size={76}
                    ring
                    dimmed={!available}
                  />
                  <Text
                    style={[styles.name, !available && styles.nameDim]}
                    numberOfLines={1}
                  >
                    {p.shortName}
                  </Text>
                  <Text style={styles.rel} numberOfLines={1}>
                    {available ? shortRelationship(p.relationship) : "No voice yet"}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <Pressable onPress={onCancel} style={styles.cancel} hitSlop={8}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** The manifest's relationship is a full sentence-ish clause; the tile has room
 *  for about two words. Take the part before the first dash or semicolon. */
function shortRelationship(rel: string): string {
  return rel.split(/[—;]/)[0].trim();
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: "#000000CC",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  sheet: {
    width: "100%",
    maxWidth: 460,
    maxHeight: "88%",
    backgroundColor: C.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
    paddingTop: 22,
    paddingBottom: 10,
    paddingHorizontal: 14,
  },
  title: {
    color: C.text,
    fontSize: 19,
    fontWeight: "800",
    textAlign: "center",
  },
  sub: {
    color: C.muted,
    fontSize: 12.5,
    textAlign: "center",
    marginTop: 5,
    marginBottom: 18,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
  },
  tile: {
    width: "25%",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 2,
  },
  tilePressed: {
    opacity: 0.6,
  },
  name: {
    color: C.text,
    fontSize: 13,
    fontWeight: "700",
    marginTop: 8,
  },
  nameDim: {
    color: C.muted,
  },
  rel: {
    color: C.muted,
    fontSize: 10.5,
    marginTop: 1,
  },
  cancel: {
    alignSelf: "center",
    paddingVertical: 12,
    paddingHorizontal: 24,
    marginTop: 6,
  },
  cancelText: {
    color: C.textDim,
    fontSize: 14,
    fontWeight: "600",
  },
});
