import React, { useEffect, useState } from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  TextInput,
  Image,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { C } from "@/constants/theme";
import { lookup, isLookupConfigured, LookupResult } from "@/services/tavily";
import { useChat } from "@/stores/chatStore";

interface Props {
  visible: boolean;
  /** The photo Tim tapped — shown as a thumbnail at the top for context. */
  photoUri: string | null;
  onClose: () => void;
}

/**
 * "🔍 Look this up" modal. Tim taps a photo in his bubble → this opens.
 * He types a query (e.g. "okapi"), hits Search → Tavily returns 3 snippets.
 * Tap "📎 Attach" on any result to add it to chatStore.pendingLookups.
 * Pending lookups inject into the next send's briefingContext.
 */
export function PhotoLookupModal({ visible, photoUri, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<LookupResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [attachedIndices, setAttachedIndices] = useState<Set<number>>(new Set());
  const attachLookup = useChat((s) => s.attachLookup);
  const pendingCount = useChat((s) => s.pendingLookups.length);

  useEffect(() => {
    if (visible) {
      setQuery("");
      setResults([]);
      setError(null);
      setAttachedIndices(new Set());
    }
  }, [visible]);

  const handleSearch = async () => {
    const q = query.trim();
    if (!q) return;
    if (!isLookupConfigured()) {
      setError("Tavily API key not configured. Set EXPO_PUBLIC_TAVILY_API_KEY.");
      return;
    }
    setLoading(true);
    setError(null);
    setAttachedIndices(new Set());
    try {
      const res = await lookup(q, 3);
      setResults(res);
      if (res.length === 0) {
        setError("No results.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed.");
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleAttach = (i: number, r: LookupResult) => {
    attachLookup({ query: query.trim(), title: r.title, content: r.content });
    setAttachedIndices((s) => new Set(s).add(i));
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable onPress={onClose} style={styles.backdrop} />
      <KeyboardAvoidingView
        style={{ width: "100%" }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <SafeAreaView style={styles.sheetWrap} edges={["bottom"]}>
          <View style={styles.sheet}>
            <View style={styles.header}>
              <Text style={styles.title}>🔍 Look this up</Text>
              <Pressable onPress={onClose} hitSlop={12}>
                <Text style={{ color: C.muted, fontSize: 18 }}>×</Text>
              </Pressable>
            </View>
            <Text style={styles.subtitle}>
              Search the web — attach snippets to your next message so Eli has
              the encyclopedic context.
              {pendingCount > 0 ? `  · ${pendingCount} already attached` : ""}
            </Text>

            <View style={styles.queryRow}>
              {photoUri ? (
                <Image source={{ uri: photoUri }} style={styles.thumb} />
              ) : null}
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="What do you want to look up?"
                placeholderTextColor={C.muted}
                style={styles.input}
                autoFocus
                onSubmitEditing={handleSearch}
                returnKeyType="search"
              />
              <Pressable
                onPress={handleSearch}
                disabled={loading || !query.trim()}
                style={[
                  styles.searchBtn,
                  (loading || !query.trim()) && { opacity: 0.4 },
                ]}
              >
                {loading ? (
                  <ActivityIndicator size="small" color={C.accent} />
                ) : (
                  <Text style={styles.searchBtnText}>Search</Text>
                )}
              </Pressable>
            </View>

            {error ? (
              <Text style={styles.errorLabel}>{error}</Text>
            ) : null}

            <ScrollView style={{ maxHeight: 380 }}>
              {results.map((r, i) => {
                const attached = attachedIndices.has(i);
                return (
                  <View key={i} style={styles.resultRow}>
                    <Text style={styles.resultTitle}>{r.title}</Text>
                    <Text style={styles.resultSnippet} numberOfLines={5}>
                      {r.content}
                    </Text>
                    <Pressable
                      onPress={() => handleAttach(i, r)}
                      disabled={attached}
                      style={[
                        styles.attachBtn,
                        attached && styles.attachBtnDone,
                      ]}
                    >
                      <Text
                        style={[
                          styles.attachBtnText,
                          attached && { color: C.green },
                        ]}
                      >
                        {attached ? "✓ Attached" : "📎 Attach to next message"}
                      </Text>
                    </Pressable>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },
  sheetWrap: {
    backgroundColor: C.raised,
    borderTopWidth: 1,
    borderTopColor: C.border,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
  },
  sheet: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  title: { color: C.text, fontSize: 16, fontWeight: "700" },
  subtitle: { color: C.muted, fontSize: 11, marginBottom: 12, lineHeight: 15 },
  queryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  thumb: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: C.surface,
  },
  input: {
    flex: 1,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    color: C.text,
  },
  searchBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: C.accent + "22",
    borderWidth: 1,
    borderColor: C.accent + "66",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 70,
  },
  searchBtnText: { color: C.accent, fontSize: 12, fontWeight: "700" },
  errorLabel: { color: C.muted, fontSize: 12, marginBottom: 10, paddingHorizontal: 4 },
  resultRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  resultTitle: { color: C.text, fontSize: 13, fontWeight: "600", marginBottom: 4 },
  resultSnippet: { color: C.textDim, fontSize: 11, lineHeight: 16, marginBottom: 8 },
  attachBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: C.accent + "14",
    borderWidth: 1,
    borderColor: C.accent + "44",
    alignSelf: "flex-start",
  },
  attachBtnDone: {
    backgroundColor: C.green + "14",
    borderColor: C.green + "44",
  },
  attachBtnText: { color: C.accent, fontSize: 11, fontWeight: "700" },
});
