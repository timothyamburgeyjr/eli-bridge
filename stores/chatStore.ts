import { create } from "zustand";
import type { Content } from "@google/generative-ai";
import type { SensorSnapshot } from "@/types";
import type { ChatItem } from "@/components/chat/ChatStream";
import { EmoteAssembler } from "@/session/EmoteAssembler";
import { STUB_SENSOR_SNAPSHOT } from "@/session/sensorStub";

export type SendStatus = "idle" | "assembling" | "error";

interface ChatState {
  messages: ChatItem[];
  status: SendStatus;
  errorMessage: string | null;
  lastEmoteChars: number | null;
  lastFilteredContext: string[] | null;
  sensorOverride: SensorSnapshot | null;

  sendMessage: (dialog: string) => Promise<void>;
  clear: () => void;
  loadDemo: (messages: ChatItem[]) => void;
  setSensorOverride: (sensors: SensorSnapshot | null) => void;
}

const assembler = new EmoteAssembler();

function timeString(d: Date = new Date()): string {
  const h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, "0");
  const hr12 = ((h + 11) % 12) + 1;
  const ampm = h >= 12 ? "PM" : "AM";
  return `${hr12}:${m} ${ampm}`;
}

function buildHistory(messages: ChatItem[]): Content[] {
  const history: Content[] = [];
  for (const m of messages) {
    if (m.from === "tim") {
      // Each prior Tim turn was built by Gemini, so role is "user" with the same input shape
      history.push({
        role: "user",
        parts: [{ text: `[TIM'S INPUT]\n${m.dialog}` }],
      });
    } else if (m.from === "eli") {
      // Phase 3: Eli doesn't respond yet, so we won't have "model" turns.
      // When Kindroid lands in Phase 4 this becomes Eli's dialog.
      history.push({
        role: "model",
        parts: [{ text: m.dialog }],
      });
    }
  }
  return history;
}

function contextPreview(filtered: SensorSnapshot): string[] {
  const out: string[] = [];
  if (filtered.location?.placeName) out.push(`📍 ${filtered.location.placeName}`);
  if (filtered.weather) out.push(`🌤️ ${Math.round(filtered.weather.temp)}°F ${filtered.weather.conditions}`);
  if (filtered.activity) out.push(`🚶 ${filtered.activity}`);
  if (filtered.nowPlaying) out.push(`🎵 ${filtered.nowPlaying.track} — ${filtered.nowPlaying.artist}`);
  if (filtered.companions?.length) out.push(`🎭 ${filtered.companions.join(", ")}`);
  if (filtered.health?.heartRate) out.push(`💓 ${filtered.health.heartRate} bpm`);
  return out;
}

export const useChat = create<ChatState>((set, get) => ({
  messages: [],
  status: "idle",
  errorMessage: null,
  lastEmoteChars: null,
  lastFilteredContext: null,
  sensorOverride: null,

  setSensorOverride: (sensors) => set({ sensorOverride: sensors }),

  clear: () => {
    assembler.reset();
    set({
      messages: [],
      status: "idle",
      errorMessage: null,
      lastEmoteChars: null,
      lastFilteredContext: null,
    });
  },

  loadDemo: (messages) => {
    assembler.reset();
    set({
      messages,
      status: "idle",
      errorMessage: null,
      lastEmoteChars: null,
      lastFilteredContext: null,
    });
  },

  sendMessage: async (dialog) => {
    const text = dialog.trim();
    if (!text) return;

    const state = get();
    const timMsgId = `tim-${Date.now()}`;
    const pendingTim: ChatItem = {
      id: timMsgId,
      from: "tim",
      time: timeString(),
      emote: "",
      dialog: text,
    };
    set({
      messages: [...state.messages, pendingTim],
      status: "assembling",
      errorMessage: null,
    });

    try {
      const sensors = state.sensorOverride ?? STUB_SENSOR_SNAPSHOT;
      const history = buildHistory(state.messages);

      const result = await assembler.assemble({
        sensors,
        timDialog: text,
        history,
      });

      // Replace the pending Tim bubble with the assembled emote + body
      const finalized: ChatItem = {
        id: timMsgId,
        from: "tim",
        time: timeString(),
        emote: result.leadingEmote,
        dialog: result.body || text,
      };

      // Phase 3 placeholder Eli response — real Eli arrives in Phase 4
      const eliStub: ChatItem = {
        id: `eli-${Date.now()}`,
        from: "eli",
        time: timeString(),
        dialog: "(Eli response pending — Phase 4 wires up Kindroid.)",
      };

      set({
        messages: [...get().messages.slice(0, -1), finalized, eliStub],
        status: "idle",
        lastEmoteChars: result.leadingEmote.length,
        lastFilteredContext: contextPreview(result.filteredSensors),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      set({
        status: "error",
        errorMessage: msg,
        // remove the pending Tim bubble on error
        messages: get().messages.filter((m) => m.id !== timMsgId),
      });
    }
  },
}));
