import React from "react";
import { FlatList, View } from "react-native";
import { TimBubble, EliBubble } from "./MessageBubble";
import { renderCard, AnyMsg } from "@/session/CardEngine";

export type ChatItem = AnyMsg;

interface Props {
  messages: ChatItem[];
  autoplay: boolean;
  micActive?: boolean;
}

function renderRow(item: ChatItem, autoplay: boolean) {
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
        />
      );
    case "eli":
      return (
        <EliBubble
          emote={item.emote}
          dialog={item.dialog}
          raw={item.raw}
          time={item.time}
          isDrive={item.isDrive}
          autoplay={autoplay}
        />
      );
    default:
      return renderCard(item);
  }
}

export function ChatStream({ messages, autoplay }: Props) {
  return (
    <FlatList
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 16, paddingBottom: 8 }}
      data={messages}
      keyExtractor={(m) => m.id}
      renderItem={({ item }) => <View>{renderRow(item, autoplay)}</View>}
      removeClippedSubviews
    />
  );
}
