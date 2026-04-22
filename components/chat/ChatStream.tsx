import React from "react";
import { FlatList, View } from "react-native";
import { TimBubble, EliBubble } from "./MessageBubble";
import { renderCard, AnyMsg } from "@/session/CardEngine";

export type ChatItem = AnyMsg;

interface Props {
  messages: ChatItem[];
  micActive?: boolean;
}

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
        />
      );
    case "eli":
      return (
        <EliBubble
          id={item.id}
          emote={item.emote}
          dialog={item.dialog}
          raw={item.raw}
          time={item.time}
          isDrive={item.isDrive}
        />
      );
    default:
      return renderCard(item);
  }
}

export function ChatStream({ messages }: Props) {
  return (
    <FlatList
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 16, paddingBottom: 8 }}
      data={messages}
      keyExtractor={(m) => m.id}
      renderItem={({ item }) => <View>{renderRow(item)}</View>}
      removeClippedSubviews
    />
  );
}
