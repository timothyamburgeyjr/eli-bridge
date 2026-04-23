import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { C } from "@/constants/theme";
import { useSession } from "@/session/SessionStore";

interface Props {
  msg: {
    time: string;
    title: string;
    date: string;
    duration: string;
    locations?: string[];
    soundtrack?: string[];
    preview?: string;
    previewQuote?: string;
    /** Full drafted markdown — editable by Tim before save. */
    fullText?: string;
  };
}

export function SessionJournalCard({ msg }: Props) {
  const [editableTitle, setEditableTitle] = useState(msg.title);
  const [editableBody, setEditableBody] = useState(msg.fullText ?? "");
  const [expanded, setExpanded] = useState(false);
  const status = useSession((s) => s.status);
  const errorMessage = useSession((s) => s.errorMessage);
  const saveJournal = useSession((s) => s.saveJournal);
  const discardJournal = useSession((s) => s.discardJournal);

  useEffect(() => {
    setEditableTitle(msg.title);
    setEditableBody(msg.fullText ?? "");
  }, [msg.title, msg.fullText]);

  const previewText = msg.preview ?? msg.previewQuote ?? "";
  const saving = status === "saving";
  const saved = status === "saved";
  const showActions = status === "journal-ready" || status === "error" || status === "saving";

  if (status === "idle" && !saved) return null;

  return (
    <View style={{ marginBottom: 20 }}>
      <View style={styles.card}>
        <Text style={styles.header}>📓 Session Journal · {msg.time}</Text>

        {showActions ? (
          <TextInput
            value={editableTitle}
            onChangeText={setEditableTitle}
            placeholder="Title"
            placeholderTextColor={C.muted}
            style={styles.titleInput}
          />
        ) : (
          <Text style={styles.title}>{editableTitle}</Text>
        )}

        <Text style={styles.meta}>
          {msg.date} · {msg.duration}
          {msg.locations && msg.locations.length > 0 ? ` · ${msg.locations.length} locations` : ""}
        </Text>

        {msg.soundtrack && msg.soundtrack.length > 0 ? (
          <View style={styles.innerBox}>
            <Text style={styles.innerLabel}>🎵 Soundtrack</Text>
            {msg.soundtrack.map((track, i) => (
              <Text key={i} style={styles.innerItem}>· {track}</Text>
            ))}
          </View>
        ) : null}

        {previewText ? <Text style={styles.preview}>"{previewText}..."</Text> : null}

        {showActions ? (
          <Pressable
            onPress={() => setExpanded((e) => !e)}
            style={styles.expandBtn}
          >
            <Text style={{ color: C.muted, fontSize: 11 }}>
              {expanded ? "▼ Hide full draft" : "▶ Show + edit full draft"}
            </Text>
          </Pressable>
        ) : null}

        {expanded && showActions ? (
          <TextInput
            value={editableBody}
            onChangeText={setEditableBody}
            multiline
            style={styles.bodyInput}
            placeholder="Journal body (markdown)"
            placeholderTextColor={C.muted}
          />
        ) : null}

        <Text style={styles.footerNote}>
          💡 Gemini drafted this from session data. Save writes to your vault root.
        </Text>

        {errorMessage ? (
          <View style={styles.errorBanner}>
            <Text style={{ color: C.red, fontSize: 11 }}>⚠ {errorMessage}</Text>
          </View>
        ) : null}

        {saved ? (
          <View style={styles.savedBanner}>
            <Text style={{ color: C.green, fontSize: 12, fontWeight: "600" }}>
              ✓ Saved to vault
            </Text>
          </View>
        ) : showActions ? (
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable
              onPress={() => saveJournal(editableTitle, editableBody)}
              disabled={saving || !editableTitle.trim()}
              style={[
                styles.saveBtn,
                (saving || !editableTitle.trim()) && { opacity: 0.5 },
              ]}
            >
              {saving ? (
                <ActivityIndicator size="small" color={C.accent} />
              ) : (
                <Text style={{ color: C.accent, fontSize: 12, fontWeight: "700" }}>
                  Save to Vault →
                </Text>
              )}
            </Pressable>
            <Pressable
              onPress={discardJournal}
              disabled={saving}
              style={[styles.discardBtn, saving && { opacity: 0.5 }]}
            >
              <Text style={{ color: C.muted, fontSize: 12 }}>Discard</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "rgba(124,92,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(124,92,255,0.3)",
    borderLeftWidth: 3,
    borderLeftColor: C.accent,
    borderRadius: 14,
    paddingHorizontal: 15,
    paddingVertical: 13,
  },
  header: {
    fontSize: 10,
    color: C.accent,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 6,
  },
  title: { color: C.text, fontWeight: "700", fontSize: 14, marginBottom: 2 },
  titleInput: {
    color: C.text,
    fontWeight: "700",
    fontSize: 14,
    marginBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    paddingVertical: 4,
  },
  meta: { color: C.muted, fontSize: 11, marginBottom: 10 },
  innerBox: {
    backgroundColor: C.surface,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 10,
  },
  innerLabel: {
    fontSize: 10,
    color: C.muted,
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  innerItem: { fontSize: 11, color: C.textDim, lineHeight: 20 },
  preview: {
    fontSize: 12,
    color: C.textDim,
    lineHeight: 20,
    marginBottom: 10,
    fontStyle: "italic",
    borderLeftWidth: 2,
    borderLeftColor: "rgba(124,92,255,0.2)",
    paddingLeft: 10,
  },
  expandBtn: {
    paddingVertical: 6,
    marginBottom: 8,
  },
  bodyInput: {
    color: C.text,
    fontSize: 12,
    lineHeight: 18,
    backgroundColor: C.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 10,
    minHeight: 180,
    maxHeight: 320,
    textAlignVertical: "top",
  },
  footerNote: { fontSize: 10, color: C.muted, marginBottom: 8 },
  errorBanner: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: C.red + "14",
    borderWidth: 1,
    borderColor: C.red + "44",
    marginBottom: 8,
  },
  saveBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: C.accent + "18",
    borderWidth: 1,
    borderColor: C.accent + "44",
    alignItems: "center",
    justifyContent: "center",
  },
  discardBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
  },
  savedBanner: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: C.green + "12",
    borderWidth: 1,
    borderColor: C.green + "33",
    alignItems: "center",
  },
});
