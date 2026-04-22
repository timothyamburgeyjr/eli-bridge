import { create } from "zustand";
import type { Content } from "@google/generative-ai";
import type { SensorSnapshot } from "@/types";
import type { ChatItem } from "@/components/chat/ChatStream";
import { EmoteAssembler } from "@/session/EmoteAssembler";
import { STUB_SENSOR_SNAPSHOT } from "@/session/sensorStub";
import { parseAssembledMessage } from "@/services/gemini";
import { sendMessage as kindroidSend } from "@/services/kindroid";
import { convertTimAsterisksToEmotes } from "@/components/chat/FormattedBody";

export type SendStatus = "idle" | "assembling" | "sending" | "error";

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
      history.push({
        role: "user",
        parts: [{ text: `[TIM'S INPUT]\n${m.raw ?? m.dialog}` }],
      });
    } else if (m.from === "eli") {
      history.push({
        role: "model",
        parts: [{ text: m.raw ?? (m.emote ? `_(*${m.emote}*)_ ${m.dialog}` : m.dialog) }],
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
      // ── Step 1: Gemini assembles the emote + combined message ───────
      const sensors = state.sensorOverride ?? STUB_SENSOR_SNAPSHOT;
      const history = buildHistory(state.messages);

      const assembled = await assembler.assemble({
        sensors,
        timDialog: text,
        history,
      });

      // ── Step 1b: Reconstruct client-side so Tim's dialog is ALWAYS preserved ──
      // Gemini occasionally drops or edits Tim's dialog despite the system prompt
      // telling it not to. We use only its ambient-scene emote and reassemble
      // the final message here: ambient + Tim's own (converted) emotes + dialog.
      const timWithEmotes = convertTimAsterisksToEmotes(text);
      const ambient = assembled.leadingEmote.trim();
      const finalRaw = ambient ? `_(*${ambient}*)_ ${timWithEmotes}` : timWithEmotes;

      const finalizedTim: ChatItem = {
        id: timMsgId,
        from: "tim",
        time: timeString(),
        emote: ambient,
        dialog: timWithEmotes,
        raw: finalRaw,
      };

      // Surface the Tim message + update status to "sending" for the Kindroid wait
      set({
        messages: [...get().messages.slice(0, -1), finalizedTim],
        status: "sending",
        lastEmoteChars: ambient.length,
        lastFilteredContext: contextPreview(assembled.filteredSensors),
      });

      // ── Step 2: Kindroid relays to Eli and returns his reply ────────
      const kindroidMessage = finalRaw;
      const eliRaw = await kindroidSend(kindroidMessage);
      const eliParsed = parseAssembledMessage(eliRaw);

      const eliMsg: ChatItem = {
        id: `eli-${Date.now()}`,
        from: "eli",
        time: timeString(),
        emote: eliParsed.leadingEmote || undefined,
        dialog: eliParsed.body || eliParsed.raw,
        raw: eliParsed.raw,
      };

      set({
        messages: [...get().messages, eliMsg],
        status: "idle",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Keep the Tim bubble (context + emote intact), just surface the error
      set({
        status: "error",
        errorMessage: msg,
      });
    }
  },
}));
