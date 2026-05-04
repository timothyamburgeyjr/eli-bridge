import React, { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { View } from "react-native";
import { C } from "@/constants/theme";
import { usePeople } from "@/people/PeopleStore";
import { DrivingOverlay } from "@/components/driving/DrivingOverlay";
import { DrivingAutoBanner } from "@/components/driving/DrivingAutoBanner";
import { installVenueBridge } from "@/session/venueBridge";
import { useConnection } from "@/stores/connectionStore";
import { useChat } from "@/stores/chatStore";
import { useSession } from "@/session/SessionStore";

export default function RootLayout() {
  const hydratePeople = usePeople((s) => s.hydrate);

  useEffect(() => {
    hydratePeople();
    // Restore the chat thread + active session FIRST, before the offline
    // queue, so message order is preserved (queue rebuilds queued bubbles
    // by appending to whatever's there). Both survive a deep-background
    // OOM kill that would otherwise reset the app to empty.
    (async () => {
      await useChat.getState().hydratePersistedMessages();
      await useSession.getState().hydrate();
      // Restore any queued sends that were pending when the app was last killed.
      useChat.getState().hydrateOfflineQueue();
    })();
    // One-time wiring: VenueMode ↔ accelerometer ride detection + RideCard dispatch.
    installVenueBridge();

    // Connectivity monitoring + offline-queue drain on reconnect.
    useConnection.getState().install();
    const unsubscribe = useConnection
      .getState()
      .onReconnect(() => {
        useChat.getState().drainOfflineQueue();
      });
    return unsubscribe;
  }, [hydratePeople]);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: C.bg }}>
      <SafeAreaProvider>
        <View style={{ flex: 1, backgroundColor: C.bg }}>
          <StatusBar style="light" backgroundColor={C.bg} />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: C.bg },
            }}
          />
          {/* Driving Mode overlay is rendered at the layout root so it's
              visible above all screens, including Settings, modals, etc. */}
          <DrivingAutoBanner />
          <DrivingOverlay />
        </View>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
