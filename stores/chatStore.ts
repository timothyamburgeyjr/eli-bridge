import { create } from "zustand";
import type { Content } from "@google/generative-ai";
import type { SensorSnapshot } from "@/types";
import type { ChatItem } from "@/components/chat/ChatStream";
import { EmoteAssembler } from "@/session/EmoteAssembler";
import { gatherSensorSnapshot } from "@/session/liveSensors";
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
import { identifySpeaker } from "@/people/voiceId";
import { identifyFaces, FaceMatch } from "@/people/faceId";
import { usePeople, Person } from "@/people/PeopleStore";
import { getPersonContext, resetPersonContextCache } from "@/people/personContext";
import { resolveOrCreateProfilePath } from "@/people/profileLinker";
import { useMode } from "@/stores/modeStore";
import { useSettings } from "@/stores/settingsStore";
import { isOffline, useConnection } from "@/stores/connectionStore";
import { persistQueue, hydrateQueue } from "@/session/queuePersistence";
import type { SpeakerLabel, FaceLabel } from "@/types";

export type SendStatus = "idle" | "assembling" | "sending" | "error";
export type SceneStatus = "idle" | "analyzing" | "error";

/**
 * A pending send that couldn't reach the upstream services (offline, or
 * Gemini/Kindroid call failed). Stored on chatStore and replayed when
 * connectivity returns. The queue holds only the *original inputs* —
 * dialog text + attachment paths + sceneMemo — so a replay runs the
 * full sendMessage pipeline with fresh sensors, fresh Obsidian context,
 * etc. The visible Tim message in the chat carries queued:true until
 * the drain completes.
 */
export interface QueuedSend {
  /** The queue entry id. Also used as the in-chat message id. */
  id: string;
  dialog: string;
  /** Copied staged attachments at enqueue time. Local paths still valid. */
  attachments: StagedAttachment[];
  /** One-shot scene memo that was pending at enqueue time. */
  sceneMemo: string | null;
  /** ISO timestamp of when this entry was queued. */
  queuedAt: string;
  /** Number of replay attempts so far. */
  retryCount: number;
  /** Last replay error, if any. */
  lastError?: string;
}

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

  /** Sends that couldn't reach the upstream services. Replayed on reconnect. */
  offlineQueue: QueuedSend[];
  /** True while the queue is being drained (prevents re-entrant drain). */
  draining: boolean;

  addAttachment: (a: Omit<StagedAttachment, "id">) => void;
  removeAttachment: (id: string) => void;
  clearAttachments: () => void;

  sendMessage: (dialog: string) => Promise<void>;
  captureScene: (photoPaths: string[], note?: string) => Promise<void>;

  /**
   * Replay queued sends in FIFO order through the normal sendMessage path.
   * Called automatically on reconnect; safe to call manually for debugging.
   * Bails out if already draining, or if the device is still offline.
   */
  drainOfflineQueue: () => Promise<void>;

  /**
   * Load the persisted offline queue from disk. Called once on app boot.
   * Rebuilds the queued Tim bubbles in the message stream so pending
   * sends are visible immediately. Safe to call multiple times.
   */
  hydrateOfflineQueue: () => Promise<void>;

  /**
   * Append a system-emitted card (RideCard, InterruptCard, etc.) directly
   * into the chat stream outside of a user send. Used by the venue bridge
   * when the accelerometer detects a completed ride, or by any future
   * passive detector that needs to surface a card mid-session.
   */
  appendSystemCard: (card: ChatItem) => void;

  /**
   * Commit an UnknownPersonCard's embedding to a named Person. Handles
   * cross-modal linking — if the name matches an existing Person card, the
   * embedding gets attached to that same card (so a voice-only Hank gains
   * a face embedding when Tim names an unknown face "Hank"). If the name
   * is new, creates a fresh Person record.
   */
  enrollFromCard: (
    cardMessageId: string,
    name: string
  ) => { person: { id: string; name: string }; linkedToExisting: boolean } | null;

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
 * Decide whether a caught send error is transient (worth retrying) or
 * permanent (show the red banner, don't retry). Conservative on purpose:
 * we'd rather retry a permanent failure and eventually give up than drop
 * a message on a transient blip.
 *
 * Transient:
 *   - Network-layer failures: fetch TypeError, "Network request failed",
 *     timeouts, aborted requests, DNS errors.
 *   - Upstream 5xx: Gemini/Kindroid/ElevenLabs temporary outages.
 *   - Currently offline at catch time (a send started online and lost
 *     connection mid-flight).
 *
 * Permanent:
 *   - 4xx (bad auth, bad request, quota exceeded).
 *   - Config/setup errors (missing env var, etc.).
 */
function isTransientSendError(err: unknown): boolean {
  if (isOffline()) return true;
  if (!(err instanceof Error)) return false;
  const m = err.message.toLowerCase();
  if (
    m.includes("network request failed") ||
    m.includes("failed to fetch") ||
    m.includes("fetch failed") ||
    m.includes("network error") ||
    m.includes("connection") ||
    m.includes("timeout") ||
    m.includes("timed out") ||
    m.includes("aborted") ||
    m.includes("enotfound") ||
    m.includes("econnreset") ||
    m.includes("econnrefused") ||
    m.includes("etimedout")
  ) {
    return true;
  }
  // HTTP status-ish: treat 5xx as transient (typically formatted like
  // "→ HTTP 503" from our service layers).
  if (/http\s*5\d\d/.test(m)) return true;
  return false;
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
  offlineQueue: [],
  draining: false,

  setSensorOverride: (sensors) => set({ sensorOverride: sensors }),

  addAttachment: (a) =>
    set((s) => ({
      pending: [...s.pending, { ...a, id: newAttachmentId(a.kind) }],
    })),

  removeAttachment: (id) =>
    set((s) => ({ pending: s.pending.filter((a) => a.id !== id) })),

  clearAttachments: () => set({ pending: [] }),

  appendSystemCard: (card) =>
    set((s) => ({ messages: [...s.messages, card] })),

  clear: () => {
    assembler.reset();
    resetPersonContextCache();
    set({
      messages: [],
      status: "idle",
      errorMessage: null,
      lastEmoteChars: null,
      lastFilteredContext: null,
      pending: [],
      pendingSceneMemo: null,
      offlineQueue: [],
      draining: false,
    });
    persistQueue([]);
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

    // Re-entry guard: if a send is already in flight, drop this call.
    // Before this guard the InputBar's send button stayed tappable during
    // assembling/sending, and rapid taps fired concurrent sendMessages —
    // each capturing fresh chat history state, so the second and third
    // copies on Kindroid had increasingly rich emotes that referenced
    // Eli's replies to the first. Draining is safe here because the
    // drainer awaits each sendMessage serially; by the time its next
    // iteration calls sendMessage, status is back to "idle".
    if (state.status === "assembling" || state.status === "sending") {
      console.warn(
        "[chatStore] sendMessage called while a send is already in flight — ignoring duplicate"
      );
      return;
    }

    // ── Offline guard ────────────────────────────────────────────────
    // If the device is offline, don't even attempt Gemini/Kindroid calls.
    // Queue the message + show a "queued" Tim bubble in the chat. The
    // queue drainer will replay this via sendMessage once we're online.
    if (isOffline()) {
      const qId = `tim-queued-${Date.now()}`;
      const queuedMsg: ChatItem = {
        id: qId,
        from: "tim",
        time: timeString(),
        emote: "",
        dialog: text || "(queued audio)",
        attachments: attachments.map((a) => ({
          type: a.kind,
          localPath: a.localPath,
          mimeType: a.mimeType,
          duration: a.duration,
        })),
        queued: true,
      };
      const entry: QueuedSend = {
        id: qId,
        dialog: text,
        attachments: [...attachments],
        sceneMemo: state.pendingSceneMemo,
        queuedAt: new Date().toISOString(),
        retryCount: 0,
      };
      const nextQueue = [...state.offlineQueue, entry];
      set({
        messages: [...state.messages, queuedMsg],
        offlineQueue: nextQueue,
        pending: [],
        pendingSceneMemo: null,
        status: "idle",
        errorMessage: null,
      });
      persistQueue(nextQueue);
      return;
    }

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
      // ── Step 1: Gather live sensor snapshot (GPS + Places + Weather + Barometer)
      const sensors = state.sensorOverride ?? (await gatherSensorSnapshot());
      const history = buildHistory(state.messages);

      // ── Step 1a: Evaluate behavioral mode transitions. VenueMode auto-
      // entry/exit fires off the snapshot's placeType + GPS; driving auto-
      // entry begins its 10s grace banner when activity is IN_VEHICLE. The
      // actual confirm/cancel of that banner is owned by the UI layer.
      const drivingAutoEnabled = useSettings.getState().drivingModeAuto;
      const modeTransitions = useMode
        .getState()
        .evaluateTransitions(sensors, { drivingAutoEnabled });

      const images = await Promise.all(
        attachments.filter((a) => a.kind === "image").map(toInlineBlob)
      );
      const audios = await Promise.all(
        attachments.filter((a) => a.kind === "audio").map(toInlineBlob)
      );

      // ── Step 1b: On-device voice + face identification
      const audioAttachments = attachments.filter((a) => a.kind === "audio");
      const imageAttachments = attachments.filter((a) => a.kind === "image");

      // Tim (the user / "self") is never labeled as a "speaker nearby" or
      // pushed through the Obsidian-context lookup — his audio already
      // becomes the message's dialog via Gemini transcription, and Gemini's
      // system prompt is already written about him. Adding a "Tim said X"
      // label + third-person profile summary is redundant and noisy.
      const isSelf = (p: Person) => p.id === "tim" || p.relationship === "self";

      const speakerLabels: SpeakerLabel[] = [];
      const matchedPeople = new Map<string, Person>(); // id → person, deduped
      // Unknown-voice auto-enrollment cards are DISABLED — the voice
      // embedding on short PTT/AudioSnap clips is too easily triggered
      // by ambient noise (HVAC, wildlife, passing cars, household sounds),
      // which produced spammy "new voice detected" cards for things that
      // weren't voices at all. Unknown voices still flow to Gemini as
      // labels for context, but Tim enrolls new people proactively via
      // Settings → People → Enroll (which collects 3 deliberate samples
      // and averages them for a cleaner embedding).
      for (const att of audioAttachments) {
        try {
          const res = await identifySpeaker(att.localPath);
          if (res.person && !isSelf(res.person)) {
            matchedPeople.set(res.person.id, res.person);
            speakerLabels.push({
              speaker: res.person.name,
              quote: "(spoken audio)",
              confidence: res.confidence,
              notes: res.person.notes, // replaced below with Obsidian context if available
            });
          } else if (!res.person) {
            // Surface as a label so the emote can acknowledge the sound,
            // but do NOT enqueue an UnknownPersonCard.
            speakerLabels.push({
              speaker: "Unknown",
              quote: "(unrecognized voice)",
              confidence: res.confidence,
            });
          }
          // matched-as-Tim → silently consumed, no label, no card
        } catch (err) {
          console.warn("[voiceId] identifySpeaker failed:", err);
        }
      }

      const faceLabels: FaceLabel[] = [];
      const unknownFaceDetections: { att: StagedAttachment; match: FaceMatch }[] = [];
      for (const att of imageAttachments) {
        try {
          const matches = await identifyFaces(att.localPath);
          for (const m of matches) {
            if (m.person) {
              // Keep Tim in faceLabels (physical presence in a photo is
              // genuinely informative — selfies, group shots). But exclude
              // him from matchedPeople so no Obsidian self-context is pulled.
              faceLabels.push({
                person: m.person.name,
                confidence: m.confidence,
                notes: m.person.notes, // replaced below with Obsidian context if available
              });
              if (!isSelf(m.person)) matchedPeople.set(m.person.id, m.person);
            } else {
              faceLabels.push({ person: "Unknown", confidence: m.confidence });
              unknownFaceDetections.push({ att, match: m });
            }
          }
        } catch (err) {
          console.warn("[faceId] identifyFaces failed:", err);
        }
      }

      // ── Step 1c: Pull Obsidian-backed context for each identified person.
      // Session-cached + Flash-condensed to the 2-3 most relevant facts for
      // right now. Runs in parallel; falls back to person.notes on any failure.
      const personContextById = new Map<string, string>();
      if (matchedPeople.size > 0) {
        const entries = Array.from(matchedPeople.values());
        const results = await Promise.all(
          entries.map(async (p) => {
            const ctx = await getPersonContext(p, sensors);
            return [p.id, ctx] as const;
          })
        );
        for (const [id, ctx] of results) {
          if (ctx) personContextById.set(id, ctx);
        }
      }
      for (const label of speakerLabels) {
        const matched = Array.from(matchedPeople.values()).find(
          (p) => p.name === label.speaker
        );
        if (matched) {
          const ctx = personContextById.get(matched.id);
          if (ctx) label.notes = ctx;
          else if (!label.notes) label.notes = matched.relationship;
        }
      }
      for (const label of faceLabels) {
        const matched = Array.from(matchedPeople.values()).find(
          (p) => p.name === label.person
        );
        if (matched) {
          const ctx = personContextById.get(matched.id);
          if (ctx) label.notes = ctx;
          else if (!label.notes) label.notes = matched.relationship;
        }
      }

      // Inject labels into the sensor snapshot so Gemini can use them
      const sensorsWithLabels = {
        ...sensors,
        ...(speakerLabels.length > 0 ? { speakerLabels } : {}),
        ...(faceLabels.length > 0 ? { faceLabels } : {}),
      };

      const sceneMemo = state.pendingSceneMemo ?? undefined;

      const assembled = await assembler.assemble({
        sensors: sensorsWithLabels,
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

      // Build UnknownPersonCard messages for unrecognized FACES only.
      // Voice unknowns are intentionally NOT auto-carded (see comment in
      // the voice-ID loop above). Faces stay because photos are deliberate
      // captures — a "hey, is this someone new?" prompt is actually useful
      // there, not noise.
      const unknownCards: ChatItem[] = [];
      for (const { att, match } of unknownFaceDetections) {
        unknownCards.push({
          id: `unk-face-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          from: "unknownperson",
          time: timeString(),
          variant: "face",
          faceNote: "Unrecognized face in your photo",
          confidence: match.confidence.toFixed(2),
          imagePath: att.localPath,
          bbox: match.bbox,
          embedding: Array.from(match.embedding),
        });
      }

      // VenueMode transition card — announces entry/exit in the chat stream.
      const modeCards: ChatItem[] = [];
      if (modeTransitions.venueEntered) {
        modeCards.push({
          id: `venue-enter-${Date.now()}`,
          from: "venuemode",
          time: timeString(),
          venueName: modeTransitions.venueEntered.name,
          venueType: modeTransitions.venueEntered.placeType,
          note: "Queue dwells suppressed · rides enabled",
        } as unknown as ChatItem);
      }
      if (modeTransitions.venueExited) {
        modeCards.push({
          id: `venue-exit-${Date.now()}`,
          from: "venuemode",
          time: timeString(),
          venueName: modeTransitions.venueExited.name,
          venueType: modeTransitions.venueExited.placeType,
          note: "Exited — venue mode off",
        } as unknown as ChatItem);
      }

      set({
        messages: [
          ...get().messages.slice(0, -1),
          ...modeCards,
          finalizedTim,
          ...unknownCards,
        ],
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

      if (isTransientSendError(err)) {
        // Convert this send into a queued retry rather than a hard error.
        // Flip the placeholder Tim bubble to queued:true, push a QueuedSend
        // entry for the drainer to replay when connectivity is confirmed
        // healthy again.
        const entry: QueuedSend = {
          id: timMsgId,
          dialog: text,
          attachments: [...attachments],
          sceneMemo: state.pendingSceneMemo ?? null,
          queuedAt: new Date().toISOString(),
          retryCount: 0,
          lastError: msg,
        };
        set((s) => {
          const nextQueue = [...s.offlineQueue, entry];
          persistQueue(nextQueue);
          return {
            messages: s.messages.map((m) =>
              m.id === timMsgId && m.from === "tim" ? { ...m, queued: true } : m
            ),
            offlineQueue: nextQueue,
            status: "idle",
            errorMessage: null,
          };
        });
        console.warn("[chatStore] transient send error, queued for retry:", msg);
      } else {
        set({
          status: "error",
          errorMessage: msg,
        });
      }
    }
  },

  enrollFromCard: (cardMessageId, name) => {
    const state = get();
    const card = state.messages.find((m) => m.id === cardMessageId);
    if (!card || card.from !== "unknownperson") return null;
    const embedding = card.embedding as number[] | undefined;
    if (!embedding) return null;
    const isVoice = card.variant !== "face";

    const peopleStore = usePeople.getState();
    const trimmed = name.trim();
    const existing = peopleStore.findByName(trimmed);
    let linked = false;

    let resultId: string;
    let resultName: string;

    if (existing) {
      // Cross-modal link — attach new modality to existing Person card
      peopleStore.updatePerson(existing.id, {
        ...(isVoice
          ? { voiceEmbedding: embedding, pendingVoiceSamples: [] }
          : { faceEmbedding: embedding }),
      });
      linked = true;
      resultId = existing.id;
      resultName = existing.name;
    } else {
      const created = peopleStore.addPerson({
        name: trimmed,
        voiceEmbedding: isVoice ? embedding : null,
        faceEmbedding: isVoice ? null : embedding,
      });
      resultId = created.id;
      resultName = created.name;
    }

    // Fire-and-forget: resolve or create the Obsidian profile page and attach
    // its path to the Person. Runs async so the enrollment UI doesn't wait
    // on the vault round-trip; updates the store when it resolves.
    const currentPerson = peopleStore.byId[resultId];
    if (currentPerson && !currentPerson.obsidianPath) {
      resolveOrCreateProfilePath(resultName)
        .then((resolved) => {
          if (!resolved) return;
          usePeople.getState().updatePerson(resultId, {
            obsidianPath: resolved.path,
          });
        })
        .catch((err) => {
          console.warn("[profileLinker] async resolve failed:", err);
        });
    }

    return {
      person: { id: resultId, name: resultName },
      linkedToExisting: linked,
    };
  },

  drainOfflineQueue: async () => {
    const state = get();
    if (state.draining) return;
    if (isOffline()) return;
    if (state.offlineQueue.length === 0) return;

    // Snapshot the queue at start; new queued items that arrive mid-drain
    // will be picked up by the next drain cycle.
    const queue = [...state.offlineQueue];
    set({ draining: true });

    try {
      for (const entry of queue) {
        // Remove the queued placeholder message; sendMessage will create
        // a fresh Tim bubble and run the full pipeline on replay.
        set((s) => {
          const nextQueue = s.offlineQueue.filter((q) => q.id !== entry.id);
          persistQueue(nextQueue);
          return {
            messages: s.messages.filter((m) => m.id !== entry.id),
            offlineQueue: nextQueue,
          };
        });
        // Re-stage the original attachments + scene memo so sendMessage
        // sees them on its next run.
        set({
          pending: entry.attachments,
          pendingSceneMemo: entry.sceneMemo,
        });
        try {
          await get().sendMessage(entry.dialog);
        } catch (err) {
          console.warn("[offlineQueue] replay failed:", err);
          // sendMessage handles its own error reporting via errorMessage;
          // stop draining to avoid a loop of failures against a flapping
          // connection.
          break;
        }
        // If we went offline mid-drain, stop and leave the rest queued.
        if (isOffline()) break;
      }
    } finally {
      set({ draining: false });
    }
  },

  hydrateOfflineQueue: async () => {
    const persisted = await hydrateQueue();
    if (persisted.length === 0) return;

    // Rebuild the queued Tim bubbles from the persisted entries so the
    // user sees their pending sends the moment the app opens.
    const rebuiltMessages: ChatItem[] = persisted.map((entry) => ({
      id: entry.id,
      from: "tim",
      time: timeString(new Date(entry.queuedAt)),
      emote: "",
      dialog: entry.dialog || "(queued audio)",
      attachments: entry.attachments.map((a) => ({
        type: a.kind,
        localPath: a.localPath,
        mimeType: a.mimeType,
        duration: a.duration,
      })),
      queued: true,
    }));

    set((s) => ({
      messages: [...rebuiltMessages, ...s.messages],
      offlineQueue: persisted,
    }));
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
