import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { C } from "@/constants/theme";

interface Props {
  msg: {
    fromIcon?: string;
    fromLabel?: string;
    fromMode?: string;
    toIcon?: string;
    toLabel?: string;
    toMode?: string;
    location?: string;
    note?: string;
    offline?: boolean;
  };
}

export function ModeTransitionCard({ msg }: Props) {
  const fromLabel = msg.fromLabel ?? msg.fromMode ?? "";
  const toLabel = msg.toLabel ?? msg.toMode ?? "";
  const location = msg.location ?? msg.note ?? "";

  return (
    <View style={styles.wrap}>
      <View
        style={[
          styles.bar,
          {
            backgroundColor: msg.offline ? C.amber + "10" : C.raised,
            borderColor: msg.offline ? C.amber + "44" : C.border,
          },
        ]}
      >
        <View style={styles.transition}>
          {msg.fromIcon ? <Text style={{ fontSize: 14 }}>{msg.fromIcon}</Text> : null}
          {fromLabel ? <Text style={{ fontSize: 11, color: C.muted }}>{fromLabel}</Text> : null}
          <Text style={{ fontSize: 10, color: C.muted }}>→</Text>
          {msg.toIcon ? <Text style={{ fontSize: 14 }}>{msg.toIcon}</Text> : null}
          <Text
            style={{
              fontSize: 11,
              color: msg.offline ? C.amber : C.textDim,
              fontWeight: "600",
            }}
          >
            {toLabel}
          </Text>
          {msg.offline ? <Text style={{ fontSize: 12 }}>📵</Text> : null}
        </View>
        {location ? (
          <Text
            style={{
              fontSize: 10,
              color: msg.offline ? C.amber + "AA" : C.muted,
              marginTop: 3,
            }}
          >
            {location}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 14 },
  bar: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
  },
  transition: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
});
