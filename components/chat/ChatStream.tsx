import React, { useCallback, useEffect, useRef } from "react";
import {
  FlatList,
  View,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from "react-native";
import { TimBubble, AiBubble } from "./MessageBubble";
import { renderCard, AnyMsg } from "@/session/CardEngine";
import { GeneratingResponse } from "./GeneratingResponse";

export type ChatItem = AnyMsg;

interface Props {
  messages: ChatItem[];
  micActive?: boolean;
}

// "Near bottom" threshold in pixels — the user is considered to be at the
// tail of the conversation if they're within this many px from the end.
// Generous enough to absorb the height of the next incoming bubble so a
// just-arrived message doesn't immediately disqualify auto-scroll.
const STICKY_BOTTOM_THRESHOLD_PX = 120;

function renderRow(item: ChatItem) {
  switch (item.from) {
    case "tim":
      return (
        <TimBubble
          emote={item.emote}
          dialog={item.dialog}
          raw={item.raw}
          time={item.time}
          pills={item.pills}
          isDrive={item.isDrive}
          queued={item.queued}
          failed={item.failed}
          attachments={item.attachments}
          presentAnchor={item.presentAnchor}
          moodLabel={item.moodLabel}
        />
      );
    case "ai":
      return (
        <AiBubble
          id={item.id}
          emote={item.emote}
          dialog={item.dialog}
          raw={item.raw}
          time={item.time}
          isDrive={item.isDrive}
          moodLabel={item.moodLabel}
        />
      );
    default:
      return renderCard(item);
  }
}

/**
 * Sticky-bottom chat list. Default behavior matches what every messaging app
 * does: when a new message arrives, scroll to the bottom — UNLESS the user
 * has scrolled up to read history, in which case respect their position.
 *
 * The "near bottom" check is tracked via a ref (not state) so toggling it
 * on every onScroll doesn't re-render the list and doesn't cause the
 * messages-change effect to thrash.
 *
 * removeClippedSubviews was previously enabled and is now off — on Android
 * it produces the "list jumps to top on update" symptom Tim hit because
 * un-clipped subviews don't always re-mount with the right offset.
 */
export function ChatStream({ messages }: Props) {
  const listRef = useRef<FlatList<ChatItem>>(null);
  const atBottomRef = useRef(true);

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
      const distanceFromBottom =
        contentSize.height - (contentOffset.y + layoutMeasurement.height);
      atBottomRef.current = distanceFromBottom < STICKY_BOTTOM_THRESHOLD_PX;
    },
    []
  );

  // On new message: scroll to end iff the user is already at the bottom.
  // Defer to next frame so the just-appended bubble has laid out.
  useEffect(() => {
    if (!atBottomRef.current) return;
    const raf = requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated: true });
    });
    return () => cancelAnimationFrame(raf);
  }, [messages.length]);

  // Initial mount + content-size jumps: snap to end without animation if at
  // bottom. Catches the "session start hydration" case where a queued chat
  // history materializes after first render.
  const handleContentSizeChange = useCallback(() => {
    if (atBottomRef.current) {
      listRef.current?.scrollToEnd({ animated: false });
    }
  }, []);

  return (
    <FlatList
      ref={listRef}
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 16, paddingBottom: 8 }}
      data={messages}
      keyExtractor={(m) => m.id}
      renderItem={({ item }) => <View>{renderRow(item)}</View>}
      // GeneratingResponse sits at the bottom of the list — appears when the
      // send pipeline is running, naturally pushed up by new messages as
      // they land. When the chat is empty it shows up at the top, which is
      // the correct "first send" location too.
      ListFooterComponent={GeneratingResponse}
      onScroll={handleScroll}
      scrollEventThrottle={100}
      onContentSizeChange={handleContentSizeChange}
    />
  );
}
