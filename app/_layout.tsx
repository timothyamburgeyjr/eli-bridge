import React, { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { View } from "react-native";
import { C } from "@/constants/theme";
import { usePeople } from "@/people/PeopleStore";
import { ConversationOverlay } from "@/components/conversation/ConversationOverlay";
import { ConversationAutoBanner } from "@/components/conversation/ConversationAutoBanner";
import { RecoveryPopup } from "@/components/common/RecoveryPopup";
import { OversizePayloadModal } from "@/components/common/OversizePayloadModal";
import { installVenueBridge } from "@/session/venueBridge";
import { installTimelineExporter } from "@/session/timelineExport";
import { useConnection } from "@/stores/connectionStore";
import { useChat } from "@/stores/chatStore";
import { useSession } from "@/session/SessionStore";
import { useTimeline } from "@/stores/timelineStore";

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
      // Restore the timeline from disk too — survives OOM kills like the chat.
      useTimeline.getState().hydrate();
    })();
    // One-time wiring: VenueMode ↔ accelerometer ride detection + RideCard dispatch.
    installVenueBridge();
    // Wire the timeline → Obsidian export action. The store stays decoupled
    // from the vault service by accepting an exporter function at boot.
    installTimelineExporter();

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
          <ConversationAutoBanner />
          <ConversationOverlay />
          {/* Timeout-recovery popup — overlays everything, Driving Mode
              included, when a pipeline step fails transiently. */}
          <RecoveryPopup />
          {/* Oversize-attachments popup — fires when a send is blocked
              because attached files would exceed Gemini's 20 MB cap. */}
          <OversizePayloadModal />
        </View>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
