import React, { useEffect, useState } from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
} from "react-native";
import { C } from "@/constants/theme";
import { useChat } from "@/stores/chatStore";
import {
  computePayloadSize,
  formatBytes,
  PAYLOAD_LIMIT_BYTES,
  AttachmentSizeItem,
} from "@/session/payloadSize";

/**
 * Pre-send payload-too-large popup. Fires when Tim tries to send a
 * collection of attachments whose combined base64-encoded size would
 * exceed Gemini's 20 MB inline-content cap. The modal lists each
 * attachment with its size + a remove button; the user can drop
 * whichever clips/photos they don't need, then close the modal and
 * retry the send normally.
 *
 * The modal recomputes the total live as the user removes attachments
 * so the "under / over limit" status reflects the current state of the
 * staging tray, not the snapshot from when the popup opened.
 */
export function OversizePayloadModal() {
  const oversize = useChat((s) => s.oversizePayload);
  const pending = useChat((s) => s.pending);
  const removeAttachment = useChat((s) => s.removeAttachment);
  const clearOversize = useChat((s) => s.clearOversizePayload);

  // Live-recompute as the user removes attachments.
  const [items, setItems] = useState<AttachmentSizeItem[]>([]);
  const [totalBytes, setTotalBytes] = useState(0);

  useEffect(() => {
    if (!oversize) {
      setItems([]);
      setTotalBytes(0);
      return;
    }
    let cancelled = false;
    (async () => {
      const info = await computePayloadSize(pending);
      if (cancelled) return;
      setItems(info.items);
      setTotalBytes(info.totalBase64Bytes);
    })();
    return () => {
      cancelled = true;
    };
  }, [oversize, pending]);

  if (!oversize) return null;

  const underLimit = totalBytes <= PAYLOAD_LIMIT_BYTES;
  const pctOfLimit = Math.min(
    100,
    Math.round((totalBytes / PAYLOAD_LIMIT_BYTES) * 100)
  );

  return (
    <Modal
      visible={true}
      transparent
      animationType="fade"
      onRequestClose={clearOversize}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.headerIcon}>{underLimit ? "✓" : "⚠"}</Text>
            <Text
              style={[
                styles.title,
                underLimit ? { color: C.green } : { color: C.amber },
              ]}
            >
              {underLimit ? "Under the limit" : "Attachments too large"}
            </Text>
          </View>

          <Text style={styles.subtitle}>
            Gemini accepts at most {formatBytes(PAYLOAD_LIMIT_BYTES)} of
            attached content per send. Remove items to get under the cap.
          </Text>

          <View style={styles.sizeRow}>
            <Text style={styles.sizeLabel}>Current</Text>
            <Text
              style={[
                styles.sizeValue,
                {
                  color: underLimit ? C.green : C.red,
                },
              ]}
            >
              {formatBytes(totalBytes)}
            </Text>
            <Text style={styles.sizeLimit}>
              / {formatBytes(PAYLOAD_LIMIT_BYTES)} ({pctOfLimit}%)
            </Text>
          </View>

          <View style={styles.barTrack}>
            <View
              style={[
                styles.barFill,
                {
                  width: `${pctOfLimit}%`,
                  backgroundColor: underLimit ? C.green : C.red,
                },
              ]}
            />
          </View>

          <ScrollView style={styles.list}>
            {items.length === 0 ? (
              <Text style={styles.empty}>
                All attachments removed. You can close this and try
                sending again.
              </Text>
            ) : (
              items.map((item) => (
                <View key={item.id} style={styles.item}>
                  <Text style={styles.itemIcon}>{iconForKind(item.kind)}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemKind}>{labelForKind(item)}</Text>
                    <Text style={styles.itemSize}>
                      {formatBytes(item.fileBytes)} on disk ·{" "}
                      {formatBytes(item.base64Bytes)} encoded
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => removeAttachment(item.id)}
                    style={styles.removeBtn}
                    hitSlop={8}
                  >
                    <Text style={styles.removeBtnText}>×</Text>
                  </Pressable>
                </View>
              ))
            )}
          </ScrollView>

          <Pressable
            onPress={clearOversize}
            style={[
              styles.closeBtn,
              underLimit && {
                backgroundColor: C.green + "1A",
                borderColor: C.green + "55",
              },
            ]}
          >
            <Text
              style={[
                styles.closeBtnText,
                underLimit && { color: C.green },
              ]}
            >
              {underLimit ? "Close — ready to send" : "Close"}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function iconForKind(kind: string): string {
  if (kind === "image") return "📷";
  if (kind === "video") return "🎥";
  if (kind === "audio") return "🎙";
  return "📎";
}

function labelForKind(item: AttachmentSizeItem): string {
  const base =
    item.kind === "image"
      ? "Photo"
      : item.kind === "video"
      ? "Video"
      : item.kind === "audio"
      ? "Audio"
      : item.kind;
  if (item.duration && (item.kind === "video" || item.kind === "audio")) {
    return `${base} · ${item.duration}s`;
  }
  return base;
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: C.raised,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.amber + "55",
    padding: 20,
  },
  header: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  headerIcon: { fontSize: 20 },
  title: { fontSize: 16, fontWeight: "700" },
  subtitle: {
    fontSize: 12,
    color: C.textDim,
    lineHeight: 17,
    marginBottom: 14,
  },
  sizeRow: { flexDirection: "row", alignItems: "baseline", gap: 6, marginBottom: 6 },
  sizeLabel: { fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: 1 },
  sizeValue: { fontSize: 18, fontWeight: "700" },
  sizeLimit: { fontSize: 11, color: C.muted },
  barTrack: {
    height: 4,
    backgroundColor: C.surface,
    borderRadius: 2,
    overflow: "hidden",
    marginBottom: 14,
  },
  barFill: { height: "100%" },
  list: { maxHeight: 280, marginBottom: 14 },
  empty: {
    color: C.muted,
    fontSize: 12,
    textAlign: "center",
    paddingVertical: 16,
    fontStyle: "italic",
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  itemIcon: { fontSize: 22 },
  itemKind: { color: C.text, fontSize: 13, fontWeight: "600" },
  itemSize: { color: C.textDim, fontSize: 11, marginTop: 2 },
  removeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.red + "55",
    backgroundColor: C.red + "14",
    alignItems: "center",
    justifyContent: "center",
  },
  removeBtnText: { color: C.red, fontSize: 16, fontWeight: "700", lineHeight: 16 },
  closeBtn: {
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
    alignItems: "center",
  },
  closeBtnText: { color: C.text, fontSize: 13, fontWeight: "700" },
});
