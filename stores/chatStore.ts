import { create } from "zustand";
import type { Content } from "@google/generative-ai";
import type { SensorSnapshot } from "@/types";
import type { ChatItem } from "@/components/chat/ChatStream";
import { EmoteAssembler } from "@/session/EmoteAssembler";
import { STUB_SENSOR_SNAPSHOT } from "@/session/sensorStub";
import { parseAssembledMessage } from "@/services/gemini";
import { sendMessage as kindroidSend, updateScene as kindroidUpdateScene } from "@/services/kindroid";
import { analyzeScene as geminiAnalyzeScene } from "@/services/gemini";
import { uploadImage, isImageServerConfigured } from "@/services/imageServer";
import { convertTimAsterisksToEmotes } from "@/components/chat/FormattedBody";
import {
  StagedAttachment,
  toInlineBlob,
  newAttachmentId,
  AttachmentKind,
} from "@/session/pendingAttachments";

export type SendStatus = "idle" | "assembling" | "sending" | "error";
export type SceneStatus = "idle" | "analyzing" | "error";

interface ChatState {
  messages: ChatItem[];
  status: SendStatus;
  errorMessage: string | null;
  lastEmoteChars: number | null;
  lastFilteredContext: string[] | null;
  sensorOverride: SensorSnapshot | null;

  /** Attachments staged for the next send. */
  pending: StagedAttachment[];

  /** Rich scene memo captured via Scene Capture, consumed on next send. */
  pendingSceneMemo: string | null;

  /** Transient status for Scene Capture flow. */
  sceneStatus: SceneStatus;
  sceneError: string | null;

  addAttachment: (a: Omit<StagedAttachment, "id">) => void;
  removeAttachment: (id: string) => void;
  clearAttachments: () => void;

  sendMessage: (dialog: string) => Promise<void>;
  captureScene: (photoPaths: string[], note?: string) => Promise<void>;

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

/**
 * Condense a long scene description to ≤160 chars framed from Eli's perspective,
 * suitable for Kindroid's current_scene field.
 */
function condenseForKindroid(richSceneText: string, note?: string): string {
  const noteBit = note ? ` ${note}.` : "";
  const seed = `Eli is with Tim. ${richSceneText.trim()}${noteBit}`;
  if (seed.length <= 160) return seed;
  return seed.slice(0, 157).replace(/\s+\S*$/, "") + "…";
}

export const useChat = create<ChatState>((set, get) => ({
  messages: [],
  status: "idle",
  errorMessage: null,
  lastEmoteChars: null,
  lastFilteredContext: null,
  sensorOverride: null,
  pending: [],
  pendingSceneMemo: null,
  sceneStatus: "idle",
  sceneError: null,

  setSensorOverride: (sensors) => set({ sensorOverride: sensors }),

  addAttachment: (a) =>
    set((s) => ({
      pending: [...s.pending, { ...a, id: newAttachmentId(a.kind) }],
    })),

  removeAttachment: (id) =>
    set((s) => ({ pending: s.pending.filter((a) => a.id !== id) })),

  clearAttachments: () => set({ pending: [] }),

  clear: () => {
    assembler.reset();
    set({
      messages: [],
      status: "idle",
      errorMessage: null,
      lastEmoteChars: null,
      lastFilteredContext: null,
      pending: [],
      pendingSceneMemo: null,
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
      pending: [],
      pendingSceneMemo: null,
    });
  },

  sendMessage: async (dialog) => {
    const text = dialog.trim();
    const state = get();
    const attachments = state.pending;

    // Must have either text or at least one attachment to send
    if (!text && attachments.length === 0) return;

    const timMsgId = `tim-${Date.now()}`;
    const pendingTim: ChatItem = {
      id: timMsgId,
      from: "tim",
      time: timeString(),
      emote: "",
      dialog: text || "(audio message)",
      attachments: attachments.map((a) => ({
        type: a.kind,
        localPath: a.localPath,
        mimeType: a.mimeType,
        duration: a.duration,
      })),
    };
    set({
      messages: [...state.messages, pendingTim],
      status: "assembling",
      errorMessage: null,
    });

    try {
      // ── Step 1: Gemini assembles the emote (with attachments as inline_data)
      const sensors = state.sensorOverride ?? STUB_SENSOR_SNAPSHOT;
      const history = buildHistory(state.messages);

      const images = await Promise.all(
        attachments.filter((a) => a.kind === "image").map(toInlineBlob)
      );
      const audios = await Promise.all(
        attachments.filter((a) => a.kind === "audio").map(toInlineBlob)
      );

      const sceneMemo = state.pendingSceneMemo ?? undefined;

      const assembled = await assembler.assemble({
        sensors,
        timDialog: text,
        images,
        audios,
        history,
        sceneMemo,
      });

      // ── Step 1b: Reconstruct client-side so Tim's text is verbatim.
      // If Tim sent only audio (no typed text), fall back to Gemini's full
      // output so the transcribed dialog survives.
      const ambient = assembled.leadingEmote.trim();
      let finalRaw: string;
      if (text) {
        const timWithEmotes = convertTimAsterisksToEmotes(text);
        finalRaw = ambient ? `_(*${ambient}*)_ ${timWithEmotes}` : timWithEmotes;
      } else {
        finalRaw = assembled.raw;
      }

      const finalizedTim: ChatItem = {
        id: timMsgId,
        from: "tim",
        time: timeString(),
        emote: ambient,
        dialog: text ? convertTimAsterisksToEmotes(text) : assembled.body,
        raw: finalRaw,
        attachments: pendingTim.attachments,
      };

      set({
        messages: [...get().messages.slice(0, -1), finalizedTim],
        status: "sending",
        lastEmoteChars: ambient.length,
        lastFilteredContext: contextPreview(assembled.filteredSensors),
        pending: [], // attachments consumed
        pendingSceneMemo: null, // scene memo consumed
      });

      // ── Step 2: Upload any images to the self-hosted image server for Kindroid's image_urls
      let imageUrls: string[] | undefined;
      if (attachments.some((a) => a.kind === "image") && isImageServerConfigured()) {
        imageUrls = [];
        for (const att of attachments.filter((a) => a.kind === "image")) {
          try {
            const result = await uploadImage(att.localPath);
            imageUrls.push(result.url);
          } catch (err) {
            // Non-fatal — Eli just won't see that image
            console.warn("Image server upload failed", err);
          }
        }
      }

      // ── Step 3: Kindroid relays to Eli
      const eliRaw = await kindroidSend(finalRaw, {
        imageUrls,
      });
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
      set({
        status: "error",
        errorMessage: msg,
      });
    }
  },

  captureScene: async (photoPaths, note) => {
    if (photoPaths.length === 0) return;
    set({ sceneStatus: "analyzing", sceneError: null });

    try {
      // ── Step 1: Gemini Pro analyzes the scene
      const images = await Promise.all(
        photoPaths.map(async (path) =>
          toInlineBlob({
            id: newAttachmentId("image"),
            kind: "image",
            localPath: path,
            mimeType: "image/jpeg",
          })
        )
      );

      const scenePrompt =
        "Describe this scene in 3-5 sentences, first-person from Tim's perspective. " +
        "Capture the room, the lighting, notable objects, ambient mood, and anything Eli should 'see' as if he's adjacent. " +
        "Do NOT wrap with _(*...*)_. Return plain prose only." +
        (note ? `\n\nTim's note on the scene: ${note}` : "");

      const richScene = await geminiAnalyzeScene({
        prompt: scenePrompt,
        images,
      });

      // ── Step 2: Immediately update Kindroid's current_scene (persistent backdrop)
      const condensed = condenseForKindroid(richScene, note);
      try {
        await kindroidUpdateScene(condensed);
      } catch (err) {
        // Non-fatal — scene memo still grounds the next emote even if the push fails
        console.warn("Kindroid updateScene failed", err);
      }

      // ── Step 3: Stage rich memo for next Tim message (one-shot)
      // ── Step 4: Add Scene card to chat stream
      const sceneCardMsg: ChatItem = {
        id: `scene-${Date.now()}`,
        from: "scene",
        time: timeString(),
        photoPaths,
        note,
        richText: richScene,
        kindroidScene: condensed,
      };

      set((s) => ({
        pendingSceneMemo: richScene,
        sceneStatus: "idle",
        sceneError: null,
        messages: [...s.messages, sceneCardMsg],
      }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ sceneStatus: "error", sceneError: msg });
    }
  },
}));
