import React, { useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from "react-native";
import { C } from "@/constants/theme";
import { useQuick } from "@/stores/quickStore";
import { useChat } from "@/stores/chatStore";
import { QuickMessagesAllModal } from "./QuickMessagesAllModal";
import type { QuickMessage } from "@/services/gemini";

/**
 * Quick Messages panel for the Conversation Mode overlay. Renders the
 * current batch of suggestions as a swipeable 2×2 card grid, paginated four
 * at a time. Tapping a card immediately sends that suggestion's body to
 * Eli via the normal sendMessage path — no review step.
 *
 * The "View All" button opens a modal listing the entire batch in a
 * single scrollable column for cases where Tim wants to scan more than the
 * current page.
 */

const CARDS_PER_PAGE = 4;

interface Props {
  /** Called when a card is tapped — overlay closes if the parent wants
   *  to dismiss after the send. Defaults to no-op so the overlay stays open. */
  onSuggestionTapped?: () => void;
}

export function QuickMessages({ onSuggestionTapped }: Props) {
  const suggestions = useQuick((s) => s.suggestions);
  const generating = useQuick((s) => s.generating);
  const lastError = useQuick((s) => s.lastError);
  const consume = useQuick((s) => s.consume);
  const sendMessage = useChat((s) => s.sendMessage);
  const chatStatus = useChat((s) => s.status);

  const [allOpen, setAllOpen] = useState(false);
  const [activePage, setActivePage] = useState(0);

  const handleTap = async (item: QuickMessage, indexInArray: number) => {
    if (chatStatus === "assembling" || chatStatus === "sending") return;
    // Optimistically consume so the slot doesn't briefly show the just-sent
    // card while the network round-trip runs.
    consume(indexInArray);
    onSuggestionTapped?.();
    try {
      await sendMessage(item.body);
    } catch (err) {
      // sendMessage handles its own error surfacing via chat status; nothing
      // for the QuickMessages UI to do.
      console.warn("[quickMessages] tap-send failed:", err);
    }
  };

  // Slice the batch into pages of 4. The card grid below renders one page
  // at a time inside a horizontal pager.
  const pages: QuickMessage[][] = [];
  for (let i = 0; i < suggestions.length; i += CARDS_PER_PAGE) {
    pages.push(suggestions.slice(i, i + CARDS_PER_PAGE));
  }

  const screenW = Dimensions.get("window").width;

  const handlePageScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    const page = Math.round(x / screenW);
    if (page !== activePage) setActivePage(page);
  };

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <View style={styles.headlineRow}>
            <Text style={styles.sparkle}>✦</Text>
            <Text style={styles.headline}>Quick Messages</Text>
          </View>
          <Text style={styles.sub}>Tap to send Eli what&apos;s happening now</Text>
        </View>
        <Pressable
          onPress={() => setAllOpen(true)}
          style={styles.viewAllBtn}
          disabled={suggestions.length === 0}
        >
          <Text style={styles.viewAllText}>View All ›</Text>
        </Pressable>
      </View>

      {suggestions.length === 0 ? (
        <View style={styles.emptyState}>
          {generating ? (
            <>
              <ActivityIndicator size="small" color={C.accent} />
              <Text style={styles.emptyText}>Generating suggestions…</Text>
            </>
          ) : lastError ? (
            <Text style={[styles.emptyText, { color: C.red }]} numberOfLines={2}>
              ⚠ {lastError}
            </Text>
          ) : (
            <Text style={styles.emptyText}>
              Suggestions will appear here as the trip evolves.
            </Text>
          )}
        </View>
      ) : (
        <>
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScroll={handlePageScroll}
            scrollEventThrottle={50}
            style={{ width: screenW }}
          >
            {pages.map((page, pageIdx) => (
              <View key={pageIdx} style={[styles.pageGrid, { width: screenW }]}>
                {page.map((item, idxInPage) => {
                  const absoluteIdx = pageIdx * CARDS_PER_PAGE + idxInPage;
                  return (
                    <Pressable
                      key={`${pageIdx}-${idxInPage}-${item.label}`}
                      onPress={() => handleTap(item, absoluteIdx)}
                      style={styles.card}
                      disabled={chatStatus === "assembling" || chatStatus === "sending"}
                    >
                      <View style={styles.cardIconWrap}>
                        <Text style={styles.cardIcon}>{item.icon}</Text>
                      </View>
                      <Text style={styles.cardLabel} numberOfLines={2}>
                        {item.label}
                      </Text>
                      <Text style={styles.cardChevron}>›</Text>
                    </Pressable>
                  );
                })}
                {/* Pad incomplete final page so the grid keeps its shape */}
                {page.length < CARDS_PER_PAGE &&
                  Array.from({ length: CARDS_PER_PAGE - page.length }).map((_, i) => (
                    <View key={`pad-${pageIdx}-${i}`} style={styles.cardPad} />
                  ))}
              </View>
            ))}
          </ScrollView>

          {pages.length > 1 && (
            <View style={styles.dotsRow}>
              {pages.map((_, i) => (
                <View
                  key={i}
                  style={[styles.dot, i === activePage && styles.dotActive]}
                />
              ))}
            </View>
          )}
        </>
      )}

      <QuickMessagesAllModal
        visible={allOpen}
        onClose={() => setAllOpen(false)}
        onSuggestionTapped={onSuggestionTapped}
      />
    </View>
  );
}

const CARD_GAP = 10;
const CARD_HORIZONTAL_INSET = 16;

const styles = StyleSheet.create({
  root: {
    paddingTop: 14,
    paddingBottom: 18,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: CARD_HORIZONTAL_INSET,
    marginBottom: 12,
  },
  headlineRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  sparkle: { fontSize: 16, color: C.accent },
  headline: { color: C.text, fontSize: 16, fontWeight: "700" },
  sub: { color: C.muted, fontSize: 11, marginTop: 2 },
  viewAllBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.accent + "55",
    backgroundColor: C.accent + "14",
  },
  viewAllText: { color: C.accent, fontSize: 12, fontWeight: "700" },
  emptyState: {
    paddingHorizontal: CARD_HORIZONTAL_INSET,
    paddingVertical: 30,
    alignItems: "center",
    gap: 10,
  },
  emptyText: { color: C.muted, fontSize: 12, textAlign: "center" },

  // Each page is a 2×2 grid laid out with flex-wrap so two cards per row.
  pageGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: CARD_HORIZONTAL_INSET,
    gap: CARD_GAP,
  },
  card: {
    width:
      (Dimensions.get("window").width - CARD_HORIZONTAL_INSET * 2 - CARD_GAP) /
      2,
    backgroundColor: C.raised,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  cardPad: {
    width:
      (Dimensions.get("window").width - CARD_HORIZONTAL_INSET * 2 - CARD_GAP) /
      2,
    height: 1,
    opacity: 0,
  },
  cardIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: C.accent + "1A",
    borderWidth: 1,
    borderColor: C.accent + "55",
    alignItems: "center",
    justifyContent: "center",
  },
  cardIcon: { fontSize: 18 },
  cardLabel: {
    flex: 1,
    color: C.text,
    fontSize: 12,
    fontWeight: "500",
    lineHeight: 15,
  },
  cardChevron: { color: C.muted, fontSize: 18 },

  dotsRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    marginTop: 12,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: C.border,
  },
  dotActive: {
    backgroundColor: C.accent,
    width: 18,
  },
});
