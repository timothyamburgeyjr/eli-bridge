import { useMode } from "@/stores/modeStore";
import { useChat } from "@/stores/chatStore";
import {
  startRideDetection,
  stopRideDetection,
  onRideEnd,
  RideEvent,
} from "@/services/accelerometer";
import type { ChatItem } from "@/components/chat/ChatStream";

let installed = false;

function timeString(d: Date = new Date()): string {
  const h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, "0");
  const hr12 = ((h + 11) % 12) + 1;
  const ampm = h >= 12 ? "PM" : "AM";
  return `${hr12}:${m} ${ampm}`;
}

function buildRideCard(event: RideEvent): ChatItem {
  const mins = Math.floor(event.durationSec / 60);
  const secs = event.durationSec % 60;
  const duration =
    mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  return {
    id: `ride-${Date.now()}`,
    from: "ride",
    time: timeString(new Date(event.endedAt)),
    rideName: "Ride detected",
    duration,
    peakG: event.peakG,
    topSpeed: event.topSpeedMph !== null ? `${event.topSpeedMph} mph` : undefined,
  } as unknown as ChatItem;
}

/**
 * Install subscriptions that bridge modeStore.venue transitions into the
 * accelerometer service lifecycle, and route ride-end events into the chat
 * stream as RideCards. Idempotent — safe to call once at app boot.
 */
export function installVenueBridge(): void {
  if (installed) return;
  installed = true;

  // Route each completed ride into the chat as a card.
  onRideEnd((event) => {
    useChat.getState().appendSystemCard(buildRideCard(event));
  });

  // Toggle the accelerometer watch based on venue state.
  let previous = useMode.getState().venue;
  if (previous) startRideDetection();

  useMode.subscribe((s) => {
    const next = s.venue;
    if (next === previous) return;
    previous = next;
    if (next) startRideDetection();
    else stopRideDetection();
  });
}
