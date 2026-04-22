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
  /** Tim's raw dialog/mic text, verbatim. */
  timDialog: string;
  /** Optional base64-encoded attachments. */
  image?: { mimeType: string; data: string };
  audio?: { mimeType: string; data: string };
  /** Prior turns in this session, most-recent-first or chronological? CHRONOLOGICAL. */
  history?: Content[];
}

export async function assembleEmote(input: AssembleEmoteInput): Promise<ParsedMessage> {
  const parts: Part[] = [];
  const header = `[SENSOR SNAPSHOT]\n${input.sensorSnapshot}\n\n[TIM'S INPUT]\n${input.timDialog}`;
  parts.push({ text: header });
  if (input.image) {
    parts.push({ inlineData: { mimeType: input.image.mimeType, data: input.image.data } });
  }
  if (input.audio) {
    parts.push({ inlineData: { mimeType: input.audio.mimeType, data: input.audio.data } });
  }

  const contents: Content[] = [...(input.history ?? []), { role: "user", parts }];

  const result = await withRetry(() => flash().generateContent({ contents }));
  const text = result.response.text();
  return parseAssembledMessage(text);
}

// ── analyzeScene (pro model) ─────────────────────────────────────

export async function analyzeScene(opts: {
  prompt: string;
  image?: { mimeType: string; data: string };
  audio?: { mimeType: string; data: string };
}): Promise<string> {
  const parts: Part[] = [{ text: opts.prompt }];
  if (opts.image) parts.push({ inlineData: opts.image });
  if (opts.audio) parts.push({ inlineData: opts.audio });
  const result = await withRetry(() =>
    pro().generateContent({ contents: [{ role: "user", parts }] })
  );
  return result.response.text().trim();
}

// ── draftJournal (flash) ─────────────────────────────────────────

export async function draftJournal(sessionSummary: string): Promise<string> {
  const prompt = `Draft a session journal entry in Tim's voice based on the following session data. Follow Section 11 of your system instructions — direct, sensory but not flowery, em dashes, Ohio-specific texture, references people by name. One to three paragraphs.\n\n[SESSION DATA]\n${sessionSummary}`;
  const result = await withRetry(() =>
    flash().generateContent({ contents: [{ role: "user", parts: [{ text: prompt }] }] })
  );
  return result.response.text().trim();
}

// ── condenseEmote (flash) ────────────────────────────────────────

export async function condenseEmote(emoteText: string, charLimit: number): Promise<string> {
  const prompt = `The following emote block is ${emoteText.length} characters and must be trimmed to under ${charLimit} characters while keeping the Tier 1 scene intact. Cut Tier 3 critical-alert material first, then Tier 2 active-texture, then compress Tier 1 language if still over budget. Return ONLY the trimmed emote text, without the _(*...*)_ wrapper.\n\n[EMOTE]\n${emoteText}`;
  const result = await withRetry(() =>
    flash().generateContent({ contents: [{ role: "user", parts: [{ text: prompt }] }] })
  );
  return result.response.text().trim();
}
