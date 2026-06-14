import React, { useEffect } from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { C } from "@/constants/theme";
import {
  useClarifications,
  ClarificationItem,
} from "@/stores/clarificationStore";

/**
 * Bottom-sheet popup that surfaces pending clarifications (companion
 * presence, place disambiguation, voice-ID confirmations, name fuzzy-
 * matches). Bundled per session — one sheet, multiple rows — so Tim
 * answers in a single pass instead of seeing N sequential popups.
 *
 * Auto-opens whenever items land in useClarifications. Closes when the
 * queue empties OR Tim taps "Skip all".
 *
 * Non-blocking by design: the send-pipeline doesn't wait on this. Answers
 * here apply to the NEXT turn's anchor.
 */
export function ClarificationSheet() {
  const items = useClarifications((s) => s.items);
  const sheetOpen = useClarifications((s) => s.sheetOpen);
  const setSheetOpen = useClarifications((s) => s.setSheetOpen);
  const resolve = useClarifications((s) => s.resolve);
  const skip = useClarifications((s) => s.skip);
  const skipAll = useClarifications((s) => s.skipAll);

  // Auto-open when items arrive; auto-close when the queue empties.
  useEffect(() => {
    if (items.length > 0 && !sheetOpen) setSheetOpen(true);
    if (items.length === 0 && sheetOpen) setSheetOpen(false);
  }, [items.length, sheetOpen, setSheetOpen]);

  const visible = sheetOpen && items.length > 0;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={() => setSheetOpen(false)}
    >
      <View style={styles.backdrop}>
        <Pressable
          style={styles.dismissArea}
          onPress={() => setSheetOpen(false)}
        />
        <SafeAreaView edges={["bottom"]} style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>Quick check</Text>
          <Text style={styles.subtitle}>
            A few things weren't sure — tap an answer or skip to leave as-is.
          </Text>

          <ScrollView style={styles.list}>
            {items.map((item) => (
              <ClarificationRow
                key={item.id}
                item={item}
                onAnswer={(idx) => resolve(item.id, idx)}
                onSkip={() => skip(item.id)}
              />
            ))}
          </ScrollView>

          <Pressable
            onPress={() => skipAll()}
            style={({ pressed }) => [styles.skipAll, pressed && { opacity: 0.5 }]}
          >
            <Text style={styles.skipAllText}>Skip all</Text>
          </Pressable>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

interface RowProps {
  item: ClarificationItem;
  onAnswer: (optionIndex: number) => void;
  onSkip: () => void;
}

function ClarificationRow({ item, onAnswer, onSkip }: RowProps) {
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text style={styles.question}>{item.question}</Text>
        {item.hint ? <Text style={styles.hint}>{item.hint}</Text> : null}
      </View>
      <View style={styles.rowActions}>
        {item.options.map((opt, idx) => (
          <Pressable
            key={idx}
            onPress={() => onAnswer(idx)}
            style={({ pressed }) => [
              styles.optBtn,
              idx === 0 ? styles.optBtnPrimary : styles.optBtnSecondary,
              pressed && { opacity: 0.7 },
            ]}
          >
            <Text
              style={
                idx === 0 ? styles.optTextPrimary : styles.optTextSecondary
              }
            >
              {opt.label}
            </Text>
          </Pressable>
        ))}
        <Pressable
          onPress={onSkip}
          style={({ pressed }) => [styles.skipBtn, pressed && { opacity: 0.5 }]}
        >
          <Text style={styles.skipText}>Skip</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "#0009",
    justifyContent: "flex-end",
  },
  dismissArea: { flex: 1 },
  sheet: {
    backgroundColor: C.raised,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    maxHeight: "70%",
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.border,
    marginBottom: 12,
  },
  title: { fontSize: 17, fontWeight: "700", color: C.text, marginBottom: 4 },
  subtitle: {
    fontSize: 12,
    color: C.textDim,
    marginBottom: 14,
    lineHeight: 17,
  },
  list: { maxHeight: 360 },
  row: {
    backgroundColor: C.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  rowText: { marginBottom: 8 },
  question: { fontSize: 14, fontWeight: "600", color: C.text },
  hint: {
    fontSize: 11,
    color: C.muted,
    marginTop: 3,
    fontStyle: "italic",
    lineHeight: 15,
  },
  rowActions: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  optBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  optBtnPrimary: {
    backgroundColor: C.accent + "22",
    borderColor: C.accent + "66",
  },
  optBtnSecondary: {
    backgroundColor: C.surface,
    borderColor: C.border,
  },
  optTextPrimary: { color: C.accent, fontSize: 13, fontWeight: "700" },
  optTextSecondary: { color: C.textDim, fontSize: 13, fontWeight: "600" },
  skipBtn: {
    marginLeft: "auto",
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  skipText: { color: C.muted, fontSize: 12 },
  skipAll: {
    alignSelf: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginTop: 4,
  },
  skipAllText: { color: C.textDim, fontSize: 12, fontWeight: "600" },
});
