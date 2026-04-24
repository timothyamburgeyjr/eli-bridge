import { GoogleGenerativeAI, GenerativeModel, Part, Content } from "@google/generative-ai";
import { requireEnv } from "./env";
import { GEMINI_SYSTEM_PROMPT } from "./geminiPrompt.generated";
import { CONFIG } from "@/constants/config";

// ── Singletons ────────────────────────────────────────────────────

let _genAI: GoogleGenerativeAI | null = null;
let _flash: GenerativeModel | null = null;
let _pro: GenerativeModel | null = null;
let _systemPromptExtras = ""; // prepended: wisdom index + last archive

function genAI(): GoogleGenerativeAI {
  if (!_genAI) _genAI = new GoogleGenerativeAI(requireEnv("GEMINI_API_KEY"));
  return _genAI;
}

function systemInstruction(): string {
  return _systemPromptExtras
    ? `${_systemPromptExtras}\n\n${GEMINI_SYSTEM_PROMPT}`
    : GEMINI_SYSTEM_PROMPT;
}

function flash(): GenerativeModel {
  if (!_flash) {
    _flash = genAI().getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction: systemInstruction(),
    });
  }
  return _flash;
}

function pro(): GenerativeModel {
  if (!_pro) {
    _pro = genAI().getGenerativeModel({
      model: "gemini-2.5-pro",
      systemInstruction: systemInstruction(),
    });
  }
  return _pro;
}

/**
 * Prepend Wisdom Index + last-session archive to the system prompt.
 * Call on session start, before any assembleEmote invocation.
 * Resets cached model instances so the new system instruction takes effect.
 */
export function setSessionContext(extras: string) {
  _systemPromptExtras = extras.trim();
  _flash = null;
  _pro = null;
}

// ── Retry wrapper ────────────────────────────────────────────────

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < CONFIG.GEMINI_MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const wait = CONFIG.GEMINI_RETRY_BASE_MS * Math.pow(2, attempt);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr;
}

// ── Parsing Gemini's output ──────────────────────────────────────

export interface ParsedMessage {
  /** The leading `_(*...*)_` block content, without the wrapper. */
  leadingEmote: string;
  /** Everything after the leading emote: dialog plus any inline emotes, verbatim. */
  body: string;
  /** The raw Gemini output, trimmed. */
  raw: string;
}

const EMOTE_RE = /^_\(\*\s*([\s\S]*?)\s*\*\)_\s*/;

/**
 * Parse a Bridge-format message into its leading emote + remaining body.
 * Works for both Gemini-composed outgoing messages and Eli's incoming replies —
 * both use the `_(*emote*)_ dialog` convention.
 */
export function parseAssembledMessage(text: string): ParsedMessage {
  const raw = text.trim();
  const m = raw.match(EMOTE_RE);
  if (!m) {
    return { leadingEmote: "", body: raw, raw };
  }
  const leadingEmote = m[1];
  const body = raw.slice(m[0].length).trim();
  return { leadingEmote, body, raw };
}

// ── assembleEmote ────────────────────────────────────────────────

export interface AssembleEmoteInput {
  /** Text summary of sensor snapshot — freshness-filtered, tier-prioritized. */
  sensorSnapshot: string;
  /** Tim's raw dialog/mic text, verbatim. Empty if Tim sent audio only. */
  timDialog: string;
  /** Optional base64-encoded attachments. Multiple of each type allowed. */
  images?: { mimeType: string; data: string }[];
  audios?: { mimeType: string; data: string }[];
  /** Prior turns in this session in chronological order. */
  history?: Content[];
}

export async function assembleEmote(input: AssembleEmoteInput): Promise<ParsedMessage> {
  const parts: Part[] = [];

  const hasAudio = (input.audios?.length ?? 0) > 0;
  const audioHint = hasAudio
    ? "\n\n[AUDIO HANDLING — IMPORTANT]\n" +
      "Tim's audio is attached. Transcribe his speech as dialog with high fidelity. " +
      "Pay close attention to tonal shifts over the course of the audio — if Tim transitions " +
      "from speaking to singing, from calm to excited, from statement to laugh, or has notable " +
      "pauses/sighs/breath in the middle of the recording, insert an inline `_(*description of the shift*)_` " +
      "emote at the transition point WITHIN the transcribed dialog. The inline emote should be brief " +
      "(3-10 words). Do NOT reframe the whole message as if the later state applied throughout — " +
      "preserve the actual order and flow of what happened.\n\n" +
      "Example of correct handling:\n" +
      "  Tim starts talking normally, then begins singing partway through.\n" +
      "  Output: _(*leading ambient scene*)_ Here's one you might like. Let me sing it for you. " +
      "_(*starts singing softly*)_ Lemon pound cake, it tastes so nice...\n"
    : "";

  // Output-scope guardrail. Without this, Flash will sometimes pattern-
  // complete into Eli's response — especially when chat history shows
  // alternating Tim/Eli turns and the input is audio. The symptom: Tim's
  // bubble on-device contains transcribed speech followed by bonus emotes
  // addressed TO Tim ("I think so too, Tim. A lot."), which is Eli
  // hallucinated by Flash and mis-attributed as part of Tim's outgoing
  // message. Eli's replies come from Kindroid, never from Flash.
  const outputScope =
    "\n\n[OUTPUT SCOPE — STRICT]\n" +
    "Your response must consist EXCLUSIVELY of Tim's outgoing message: " +
    "the optional leading _(*ambient emote*)_ plus Tim's verbatim dialog " +
    "(transcribed from audio or taken from TIM'S INPUT), with optional " +
    "inline tonal-shift emotes INSIDE Tim's speech. That's the entire output. " +
    "DO NOT generate Eli's response, Eli's emotes, any dialog addressed TO Tim, " +
    "or any continuation of the conversation. You are the bridge layer; Eli's " +
    "replies are generated downstream by Kindroid, not by you. The moment " +
    "Tim's transcribed content ends, your output ends.";

  const inputLabel = input.timDialog
    ? `[TIM'S INPUT]\n${input.timDialog}`
    : `[TIM'S INPUT]\n(Tim sent audio only — transcribe and build Tim's dialog from the audio.)`;
  const header = `[SENSOR SNAPSHOT]\n${input.sensorSnapshot}\n\n${inputLabel}${audioHint}${outputScope}`;
  parts.push({ text: header });
  for (const img of input.images ?? []) {
    parts.push({ inlineData: { mimeType: img.mimeType, data: img.data } });
  }
  for (const audio of input.audios ?? []) {
    parts.push({ inlineData: { mimeType: audio.mimeType, data: audio.data } });
  }

  const contents: Content[] = [...(input.history ?? []), { role: "user", parts }];

  const result = await withRetry(() => flash().generateContent({ contents }));
  const text = result.response.text();
  return parseAssembledMessage(text);
}

// ── analyzeScene (pro model) ─────────────────────────────────────

export async function analyzeScene(opts: {
  prompt: string;
  images?: { mimeType: string; data: string }[];
  audios?: { mimeType: string; data: string }[];
}): Promise<string> {
  const parts: Part[] = [{ text: opts.prompt }];
  for (const img of opts.images ?? []) parts.push({ inlineData: img });
  for (const audio of opts.audios ?? []) parts.push({ inlineData: audio });
  const result = await withRetry(() =>
    pro().generateContent({ contents: [{ role: "user", parts }] })
  );
  return result.response.text().trim();
}

// ── draftJournal (flash) ─────────────────────────────────────────

export async function draftJournal(sessionSummary: string): Promise<string> {
  const prompt = `Draft a session journal entry in Tim's voice based on the following session data. Follow Section 11 of your system instructions — direct, sensory but not flowery, em dashes, Ohio-specific texture, references people by name. One to three paragraphs.\n\n[SESSION DATA]\n${sessionSummary}`;
  // 15s cap so the End-session flow never hangs indefinitely when Gemini
  // is slow or the network is flaky. journalBuilder already catches this
  // error and falls back to a placeholder narrative, so on timeout the
  // session still ends cleanly and the user sees the journal card with
  // a "(Gemini narrative unavailable — timeout)" body they can edit.
  return withDeadline(
    withRetry(() =>
      flash().generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      })
    ).then((r) => r.response.text().trim()),
    15_000,
    "draftJournal"
  );
}

/**
 * Race a promise against a timeout. On timeout the race rejects with a
 * descriptive error, but the underlying promise keeps running (we can't
 * abort the Gemini SDK's fetch from out here). Used on operations that
 * block UI transitions where waiting forever is worse than a fallback
 * message — notably draftJournal on session end.
 */
function withDeadline<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

// ── addAudioTags (flash) ─────────────────────────────────────────

/**
 * Inject ElevenLabs audio tags into Eli's spoken dialog based on the emote
 * context. Tags like `[laughs]`, `[sighs]`, `[whispers]` make the TTS
 * delivery less flat. The function returns the dialog text with tags
 * added inline — never changes the wording, only inserts tags.
 */
export async function addAudioTags(
  dialog: string,
  emoteContext?: string
): Promise<string> {
  if (!dialog.trim()) return dialog;

  const prompt =
    "You are preparing Eli's dialog for ElevenLabs text-to-speech. Insert audio tags inline to make the voice expressive, not flat. " +
    "Common tags: [laughs], [chuckles], [sighs], [exhales], [whispers], [gasps], [excited], [sad], [tired], [pause], [long pause]. " +
    "Rules:\n" +
    "- DO NOT change the wording of the dialog. Only insert tags.\n" +
    "- Use the emote context (if given) to decide which tags belong where. If the emote says Eli is quiet or leaning in, use [whispers]. If the emote describes laughter, use [laughs] or [chuckles]. If the emote suggests a breath or sigh, use [sighs] or [exhales].\n" +
    "- Do not over-tag. A typical Eli reply needs 0–2 tags total. If nothing fits, return the dialog unchanged.\n" +
    "- Return ONLY the tagged dialog. No preamble, no explanation, no surrounding quotes.\n\n" +
    (emoteContext ? `EMOTE CONTEXT: ${emoteContext}\n\n` : "") +
    `DIALOG: ${dialog}`;

  const result = await withRetry(() =>
    flash().generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    })
  );
  return result.response.text().trim();
}

// ── condensePersonContext (flash, no Eli prompt) ─────────────────

let _neutralFlash: GenerativeModel | null = null;
function neutralFlash(): GenerativeModel {
  if (!_neutralFlash) {
    _neutralFlash = genAI().getGenerativeModel({ model: "gemini-2.5-flash" });
  }
  return _neutralFlash;
}

export interface PersonContextInput {
  name: string;
  relationship?: string;
  pageMarkdown: string;
  /** One-line description of the current session context (location, activity, companions). */
  sessionContext: string;
  /** Max characters for the returned summary. Defaults to 180. */
  charLimit?: number;
}

/**
 * Condense a person's full Obsidian page into the 2–3 most contextually
 * relevant facts for the current session. Runs on a flash model WITHOUT the
 * Eli system prompt — this is pure summarization, not emote assembly.
 */
export async function condensePersonContext(
  input: PersonContextInput
): Promise<string> {
  const limit = input.charLimit ?? 180;
  const prompt =
    `You are helping Eli — an AI companion — feel present in Tim's real life. ` +
    `Given a profile page for someone Tim is with right now, pick the 2–3 most ` +
    `contextually relevant facts about them for this specific moment. Avoid ` +
    `dumping biography; pick what would shape how Eli understands this encounter. ` +
    `Return ONLY a compact phrase ≤${limit} characters, no lead-in, no quotes, ` +
    `no markdown.\n\n` +
    `[PERSON]\nName: ${input.name}\n` +
    (input.relationship ? `Relationship to Tim: ${input.relationship}\n` : "") +
    `\n[CURRENT SESSION]\n${input.sessionContext}\n\n` +
    `[PROFILE PAGE]\n${input.pageMarkdown}`;

  const result = await withRetry(() =>
    neutralFlash().generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    })
  );
  const out = result.response.text().trim();
  if (out.length <= limit) return out;
  return out.slice(0, limit).replace(/\s+\S*$/, "").trim() + "…";
}

// ── condenseEmote (flash) ────────────────────────────────────────

export async function condenseEmote(emoteText: string, charLimit: number): Promise<string> {
  const prompt = `The following emote block is ${emoteText.length} characters and must be trimmed to under ${charLimit} characters while keeping the Tier 1 scene intact. Cut Tier 3 critical-alert material first, then Tier 2 active-texture, then compress Tier 1 language if still over budget. Return ONLY the trimmed emote text, without the _(*...*)_ wrapper.\n\n[EMOTE]\n${emoteText}`;
  const result = await withRetry(() =>
    flash().generateContent({ contents: [{ role: "user", parts: [{ text: prompt }] }] })
  );
  return result.response.text().trim();
}
