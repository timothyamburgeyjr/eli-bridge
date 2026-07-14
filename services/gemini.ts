import { GoogleGenerativeAI, GenerativeModel, Part, Content } from "@google/generative-ai";
import { requireEnv } from "./env";
import { GEMINI_SYSTEM_PROMPT } from "./geminiPrompt.generated";
import { CONFIG } from "@/constants/config";
import { logApiCall } from "@/session/diagnosticLog";
import {
  isMoodLabel,
  MOODS,
  MOOD_LABELS,
  type MoodLabel,
  type MoodReading,
} from "@/constants/moods";

// ── Singletons ────────────────────────────────────────────────────

let _genAI: GoogleGenerativeAI | null = null;
let _flash: GenerativeModel | null = null;
let _pro: GenerativeModel | null = null;
let _systemPromptExtras = ""; // prepended: the session's persona block
let _companionName = "the companion"; // set per session by setSessionContext
// The companion's response directive — the 250-char field that defines HOW he
// speaks. Fed to addAudioTags so Bobby's gravel and Tommy's stutter reach the
// TTS layer instead of all eight being tagged identically.
let _companionVoice = "";

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
 * Prepend the session's persona block to the system prompt, and record who Tim
 * is talking to so the runtime-built prompts below can name them.
 *
 * Call on session start, before any assembleEmote invocation. Resets the cached
 * model instances so the new system instruction takes effect.
 *
 * `companion` is a plain string rather than a Personality so this service stays
 * free of a SessionStore import — SessionStore already imports from here.
 */
export function setSessionContext(
  extras: string,
  companion?: string,
  voiceDirective?: string
) {
  _systemPromptExtras = extras.trim();
  if (companion) _companionName = companion;
  // Cleared on every session start (callers pass "" when they have nothing),
  // so a failed persona load can't leave the last companion's voice in place.
  _companionVoice = (voiceDirective ?? "").trim();
  _flash = null;
  _pro = null;
}

/**
 * Who Tim is talking to. Falls back to a neutral noun outside a session (or if
 * the persona load failed), which reads correctly in every prompt below.
 */
function companionName(): string {
  return _companionName;
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
  /**
   * Companion-state inference emitted by assembleEmote — high-confidence
   * adds/removes get applied silently by the EmoteAssembler caller; the
   * `ambiguous` list seeds the ClarificationQueue for Tim to confirm.
   * Absent for non-emote-assembly paths (Eli's incoming replies, etc.).
   */
  companionDelta?: {
    added: string[];
    removed: string[];
    ambiguous: { name: string; hint: string }[];
  };
  /**
   * Gemini's read of the moment's mood, emitted as a second structured tail.
   * Absent on non-emote-assembly paths and whenever the tail is missing or
   * malformed — mood is never load-bearing for a send.
   */
  moodRead?: MoodReading;
}

const EMOTE_RE = /^_\(\*\s*([\s\S]*?)\s*\*\)_\s*/;

const MOOD_MARKER = "[MOOD]";
const DELTA_MARKER = "[COMPANION_DELTA]";

/**
 * Parse a Bridge-format message into its leading emote + remaining body.
 * Works for both Gemini-composed outgoing messages and the companion's incoming
 * replies — both use the `_(*emote*)_ dialog` convention.
 *
 * assembleEmote appends up to TWO structured tails after the dialog:
 * `[COMPANION_DELTA] {...}` and `[MOOD] {...}`. They are peeled off one at a
 * time, LAST MARKER FIRST, so the order the model emitted them in doesn't
 * matter.
 *
 * Two traps this shape exists to avoid, both found by testing rather than
 * reasoning:
 *
 *  1. The obvious implementation — an end-anchored regex with a lazy
 *     `\{[\s\S]*?\}` per tail — has each pattern SWALLOW THE OTHER. The lazy
 *     group expands to the last `}` in the string, so `[MOOD]` emitted before
 *     `[COMPANION_DELTA]` captures the delta tail as part of its own JSON.
 *  2. A truncated or malformed tail matches no regex at all, so it never gets
 *     stripped — and the literal `[COMPANION_DELTA] {...}` text then ships to
 *     Kindroid inside Tim's message. Peeling on the MARKER instead of on a
 *     well-formed JSON match means a bad tail still gets removed; we just lose
 *     its value, which is the correct failure. Mood and companion tracking are
 *     never load-bearing for a send.
 */
export function parseAssembledMessage(text: string): ParsedMessage {
  let raw = text.trim();

  let companionDelta: ParsedMessage["companionDelta"];
  let moodRead: MoodReading | undefined;

  // Bounded: two tails, plus slack for a model that repeats one.
  for (let i = 0; i < 4; i++) {
    const iMood = raw.lastIndexOf(MOOD_MARKER);
    const iDelta = raw.lastIndexOf(DELTA_MARKER);
    const at = Math.max(iMood, iDelta);
    if (at < 0) break;

    const isMood = iMood > iDelta;
    const marker = isMood ? MOOD_MARKER : DELTA_MARKER;

    // This is the LAST marker in the string, so everything after it is its
    // payload — no need to guess where the JSON ends.
    const after = raw.slice(at + marker.length);
    const brace = after.indexOf("{");
    // A marker with no object after it isn't a tail; leave it alone rather
    // than eat the rest of the message.
    if (brace < 0 || after.slice(0, brace).trim() !== "") break;

    const json = after.slice(brace).trim();
    if (isMood) moodRead ??= parseMoodTail(json);
    else companionDelta ??= parseDeltaTail(json);

    raw = raw.slice(0, at).trimEnd();
  }

  const m = raw.match(EMOTE_RE);
  if (!m) {
    return { leadingEmote: "", body: raw, raw, companionDelta, moodRead };
  }
  const leadingEmote = m[1];
  const body = raw.slice(m[0].length).trim();
  return { leadingEmote, body, raw, companionDelta, moodRead };
}

function parseDeltaTail(json: string): ParsedMessage["companionDelta"] {
  try {
    const parsed = JSON.parse(json) as {
      added?: unknown;
      removed?: unknown;
      ambiguous?: unknown;
    };
    const added = Array.isArray(parsed.added)
      ? parsed.added.filter((v): v is string => typeof v === "string")
      : [];
    const removed = Array.isArray(parsed.removed)
      ? parsed.removed.filter((v): v is string => typeof v === "string")
      : [];
    const ambiguous = Array.isArray(parsed.ambiguous)
      ? parsed.ambiguous
          .filter(
            (v): v is { name: string; hint: string } =>
              !!v &&
              typeof v === "object" &&
              typeof (v as { name?: unknown }).name === "string" &&
              typeof (v as { hint?: unknown }).hint === "string"
          )
          .map((v) => ({ name: v.name, hint: v.hint }))
      : [];
    return { added, removed, ambiguous };
  } catch {
    return undefined;
  }
}

function parseMoodTail(json: string): MoodReading | undefined {
  try {
    const p = JSON.parse(json) as Record<string, unknown>;
    if (!isMoodLabel(p.label)) return undefined;
    const num = (v: unknown, lo: number, hi: number, dflt: number) =>
      typeof v === "number" && Number.isFinite(v)
        ? Math.max(lo, Math.min(hi, v))
        : dflt;
    return {
      label: p.label,
      valence: num(p.valence, -1, 1, 0),
      energy: num(p.energy, 0, 1, 0.3),
      confidence: num(p.confidence, 0, 1, 0.3),
      sources: Array.isArray(p.sources)
        ? p.sources.filter((v): v is string => typeof v === "string").slice(0, 3)
        : [],
      origin: "gemini",
    };
  } catch {
    return undefined;
  }
}

// ── assembleEmote ────────────────────────────────────────────────

export interface AssembleEmoteInput {
  /** Text summary of sensor snapshot — freshness-filtered, tier-prioritized. */
  sensorSnapshot: string;
  /** Tim's raw dialog/mic text, verbatim. Empty if Tim sent audio only. */
  timDialog: string;
  /** Optional base64-encoded attachments. Multiple of each type allowed.
   *  Videos go inline as well (Gemini 2.5 Flash supports video input);
   *  practical size cap is ~20MB, enforced upstream by capping recording
   *  duration + quality. */
  images?: { mimeType: string; data: string }[];
  audios?: { mimeType: string; data: string }[];
  videos?: { mimeType: string; data: string }[];
  /** Prior turns in this session in chronological order. */
  history?: Content[];
  /**
   * Current companion roster — drives the COMPANION_DELTA inference. The
   * model returns who joined/left this turn relative to this list. Empty
   * = just Tim and Eli. Roster names come from PeopleStore where possible.
   */
  currentCompanions?: string[];
  /**
   * Known names from the PeopleStore roster. Used so Gemini resolves
   * "Henry" to "Hank" (or surfaces it as ambiguous) instead of inventing
   * a new identity each turn. Empty/undefined → no roster guidance.
   */
  rosterNames?: string[];
  /** Abort signal — wired into the deadline race so a user abort wakes us
   *  immediately instead of waiting out the full 30s budget. */
  signal?: AbortSignal;
}

export async function assembleEmote(input: AssembleEmoteInput): Promise<ParsedMessage> {
  const parts: Part[] = [];

  const hasAudio = (input.audios?.length ?? 0) > 0;
  const hasVideo = (input.videos?.length ?? 0) > 0;
  const videoHint = hasVideo
    ? "\n\n[VIDEO HANDLING — IMPORTANT]\n" +
      "Tim's video clip is attached. Build the leading ambient emote around " +
      "what HAPPENS across the clip — movement, what comes into and out of " +
      "frame, sounds, mood. Capture the arc, not just one frame. Tim took " +
      "this video FROM his point of view, so describe it first-person, like " +
      "he's narrating: \"I pan across the kitchen and Luna is on the couch\", " +
      "not \"the video shows…\". The video's audio is part of the clip — " +
      "transcribe any of Tim's narration as his dialog (same rules as the " +
      "audio handling above) and weave ambient sound into the emote.\n"
    : "";

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
  // complete into the companion's response — especially when chat history shows
  // alternating Tim/companion turns and the input is audio. The symptom: Tim's
  // bubble on-device contains transcribed speech followed by bonus emotes
  // addressed TO Tim ("I think so too, Tim. A lot."), which is the companion
  // hallucinated by Flash and mis-attributed as part of Tim's outgoing
  // message. The companion's replies come from Kindroid, never from Flash.
  //
  // The COMPANION_DELTA tail is the one explicit exception — it's a small
  // structured suffix Flash appends AFTER the dialog, parsed by
  // parseAssembledMessage and stripped before the message reaches Kindroid.
  const who = companionName();
  const outputScope =
    "\n\n[OUTPUT SCOPE — STRICT]\n" +
    "Your response must consist EXCLUSIVELY of Tim's outgoing message: " +
    "the optional leading _(*ambient emote*)_ plus Tim's verbatim dialog " +
    "(transcribed from audio or taken from TIM'S INPUT), with optional " +
    "inline tonal-shift emotes INSIDE Tim's speech. Then — ALWAYS — the " +
    "[COMPANION_DELTA] tail and the [MOOD] tail described below. Those two " +
    "structured tails are the ONLY permitted exceptions; that's the entire " +
    "output. " +
    `DO NOT generate ${who}'s response, ${who}'s emotes, any dialog addressed ` +
    `TO Tim, or any continuation of the conversation. You are the bridge layer; ` +
    `${who}'s replies are generated downstream by Kindroid, not by you.`;

  // Mood read — a second structured tail, peeled off by parseAssembledMessage
  // and never sent to Kindroid. The model that READS the mood is the model that
  // WRITES the words, in one forward pass, so it costs nothing extra and lands
  // at exactly the right layer.
  const moodTail =
    "\n\n[MOOD — STRUCTURED TAIL]\n" +
    "After the [COMPANION_DELTA] tail, append on its own line the literal " +
    "marker `[MOOD]` followed by a single JSON object on the next line, " +
    "reporting the emotional weather of Tim's present moment.\n\n" +
    `- \`label\` — EXACTLY ONE of: ${MOOD_LABELS.join(", ")}. No other value is ` +
    "valid. If nothing distinctive is happening, `neutral` is the correct and " +
    "expected answer — it is not a failure.\n" +
    "- `valence` — how good/bad this moment feels to Tim. -1.0 (dread, grief) " +
    "to 1.0 (joy). 0 is flat.\n" +
    "- `energy` — how activated the moment is. 0.0 (stillness) to 1.0 " +
    "(adrenaline). Note that `ominous` and `charged` are BOTH high-energy, and " +
    "`melancholy` and `serene` are BOTH low-energy. Energy is not happiness.\n" +
    "- `confidence` — 0.0–1.0. Be honest and conservative. One ambiguous text " +
    "from Tim with no photos is a 0.3, not a 0.8. Exceed 0.8 only when the " +
    "moment is unmistakable.\n" +
    "- `sources` — 1–3 SHORT strings naming the concrete evidence you actually " +
    "used. These are shown to Tim. \"Tim's voice tightened\" is a source. " +
    "\"The vibe\" is not.\n\n" +
    "Weigh what Tim SAYS and what his PHOTOS SHOW above what the sensors " +
    "report. If the snapshot carries a provisional mood read, treat it as a " +
    "HINT you may override — the sensors set a floor; you have the whole " +
    "moment. Emit this tail on EVERY message, including when the mood is " +
    "neutral. It is machine-read and stripped before the message is sent.\n\n" +
    "Example tail:\n" +
    "[MOOD]\n" +
    '{"label":"charged","valence":0.7,"energy":0.9,"confidence":0.75,' +
    '"sources":["queue for The Beast","Tim\'s dialog is clipped and fast"]}';

  const rosterLine = input.rosterNames?.length
    ? `Known people in Tim's roster (resolve names against these — "Henry" probably means "Hank" if "Hank" is in the roster): ${input.rosterNames.join(", ")}.\n`
    : "";
  const currentLine = input.currentCompanions?.length
    ? `Currently understood to be present with Tim (besides ${who}): ${input.currentCompanions.join(", ")}.\n`
    : `No one else is currently understood to be present — it's just Tim (and ${who} on the bridge).\n`;

  // Companion inference instruction. Lives in the prompt as a separate
  // STRUCTURED-OUTPUT block so Flash treats the JSON tail as a discrete
  // task, not part of the emote/dialog generation.
  const companionInference =
    "\n\n[COMPANION INFERENCE — STRUCTURED TAIL]\n" +
    rosterLine +
    currentLine +
    "After Tim's outgoing message text, append on its own line the literal " +
    "marker `[COMPANION_DELTA]` followed by a single JSON object on the " +
    "next line. The object has three keys: `added` (string[]), `removed` " +
    "(string[]), `ambiguous` (array of {name, hint}). Infer from Tim's " +
    "dialog and the conversation context who is physically present this " +
    "turn vs. last turn.\n\n" +
    "RULES:\n" +
    "- ONLY include confirmed-present statements in `added` (e.g. \"Hank's in the car now\", \"just picked up Mom\", \"Dad's here too\"). Plans, hypotheticals, and people merely talked-about do NOT get added.\n" +
    "- ONLY include explicit departures in `removed` (e.g. \"dropped Hank off\", \"Mom went home\"). Do NOT auto-remove people who simply haven't been mentioned in a while.\n" +
    "- Resolve names against the roster when possible — if Tim says \"Henry\" and the roster has \"Hank\", emit \"Hank\" in `added`, not \"Henry\".\n" +
    "- When Tim mentions someone but it's unclear if they're physically present (first mention without arrival context, or roster name that's close but not exact), put them in `ambiguous` with a one-line `hint` explaining the uncertainty. Do NOT add them to `added`. Tim will be asked to confirm via a popup.\n" +
    "- When nothing changes this turn, emit `{\"added\": [], \"removed\": [], \"ambiguous\": []}` — never omit the tail.\n" +
    `- Tim and ${who} are ALWAYS implied present. Never include either of them in any of the three lists.\n\n` +
    "Example tail (one person joins, nothing else):\n" +
    "[COMPANION_DELTA]\n" +
    "{\"added\": [\"Hank\"], \"removed\": [], \"ambiguous\": []}";

  const inputLabel = input.timDialog
    ? `[TIM'S INPUT]\n${input.timDialog}`
    : `[TIM'S INPUT]\n(Tim sent audio only — transcribe and build Tim's dialog from the audio.)`;
  const header = `[SENSOR SNAPSHOT]\n${input.sensorSnapshot}\n\n${inputLabel}${audioHint}${videoHint}${outputScope}${companionInference}${moodTail}`;
  parts.push({ text: header });
  for (const img of input.images ?? []) {
    parts.push({ inlineData: { mimeType: img.mimeType, data: img.data } });
  }
  for (const audio of input.audios ?? []) {
    parts.push({ inlineData: { mimeType: audio.mimeType, data: audio.data } });
  }
  for (const video of input.videos ?? []) {
    parts.push({ inlineData: { mimeType: video.mimeType, data: video.data } });
  }

  const contents: Content[] = [...(input.history ?? []), { role: "user", parts }];

  // 45s deadline. Flash typically returns in <3s, but `withRetry` stacks up
  // to ~14s of exponential backoff inside this window across 3 attempts; a
  // tighter wall (the previous 30s) didn't leave room for a full retry cycle
  // when Gemini briefly returned 5xx or the cellular link was slow. Field
  // sessions (2026-05-31) showed 3 emote timeouts at exactly 30s coinciding
  // with Google's gemini-2.5-flash returning 500s — those retries deserved
  // longer to land. 45s still surfaces a genuine hang quickly enough that
  // Conversation Mode doesn't lock for a minute.
  const result = await withDeadline(
    withRetry(() => flash().generateContent({ contents })),
    45_000,
    "assembleEmote",
    input.signal
  );
  const text = result.response.text();
  return parseAssembledMessage(text);
}

// ── analyzeScene (pro model) ─────────────────────────────────────

export async function analyzeScene(opts: {
  prompt: string;
  images?: { mimeType: string; data: string }[];
  audios?: { mimeType: string; data: string }[];
  signal?: AbortSignal;
}): Promise<string> {
  const parts: Part[] = [{ text: opts.prompt }];
  for (const img of opts.images ?? []) parts.push({ inlineData: img });
  for (const audio of opts.audios ?? []) parts.push({ inlineData: audio });
  // 45s — Pro is slower than Flash and scene captures can include multiple
  // images. Past 45s is a hang.
  const result = await withDeadline(
    withRetry(() =>
      pro().generateContent({ contents: [{ role: "user", parts }] })
    ),
    45_000,
    "analyzeScene",
    opts.signal
  );
  return result.response.text().trim();
}

// ── analyzePhotoSubject (pro model) ───────────────────────────────

export interface PhotoSubjectAnalysis {
  /** The main subject Gemini identified (e.g. "Okapi", "Beale's eyed turtle"). */
  subject: string;
  /** 3-4 sentence encyclopedic context Gemini wrote from its training. */
  context: string;
}

/**
 * Drives the "🔍 Look this up" flow. Tim taps a photo → we ask Gemini Pro
 * to identify the main subject of the image AND emit encyclopedic context
 * about that subject from its training. Cuts out the web-search step
 * entirely — Pro's training is vastly more useful for "what is this
 * animal" style questions than scraping web snippets.
 *
 * Returns { subject, context } parsed from a structured prompt response.
 * Throws on parse failure or timeout.
 */
export async function analyzePhotoSubject(image: {
  mimeType: string;
  data: string;
}): Promise<PhotoSubjectAnalysis> {
  const prompt =
    "You are looking at a photo Tim took. Identify the MAIN SUBJECT of " +
    "the photo (the animal, plant, building, object, dish, etc. that Tim " +
    "is most likely interested in — usually the central or most distinct " +
    "element, not the background) and provide encyclopedic context about " +
    "that subject from your training knowledge.\n\n" +
    "Respond in EXACTLY this format, no preamble, no markdown:\n" +
    "SUBJECT: <short name of the subject — e.g. \"Okapi\" or \"Beale's eyed turtle\" or \"1967 Mustang Fastback\">\n" +
    "CONTEXT: <3-4 sentences of factual context about the subject. What " +
    "is it, where does it live / where is it from, key distinguishing " +
    "facts. Plain prose, no bullet points. Don't describe the photo " +
    "itself — describe the subject.>";

  const text = await analyzeScene({ prompt, images: [image] });
  const subjectMatch = text.match(/^\s*SUBJECT:\s*(.+?)\s*$/im);
  const contextMatch = text.match(/^\s*CONTEXT:\s*([\s\S]+?)\s*$/im);
  if (!subjectMatch || !contextMatch) {
    throw new Error(
      `analyzePhotoSubject: couldn't parse Gemini response. Raw: ${text.slice(0, 200)}`
    );
  }
  return {
    subject: subjectMatch[1].trim(),
    context: contextMatch[1].trim(),
  };
}

// ── analyzePhotoCandidates + researchPhotoSubject (pro model) ────
//
// Two-stage variant of the "🔍 Look this up" flow. Replaces the single-shot
// analyzePhotoSubject path in PhotoLookupModal — instead of Gemini guessing
// the one "main subject" of the photo, Tim sees a short list of candidate
// subjects in the image and picks the one he actually cares about. The
// chosen subject then gets researched on its own (image re-attached so
// Gemini can write specific-to-this-shot context, not just generic prose).

export interface PhotoCandidate {
  /** Short label, 1-4 words — e.g. "Beale's eyed turtle". Used as the
   *  attached-lookup subject if Tim picks it. */
  subject: string;
  /** Brief locator, 5-10 words — where in the image it is or what it looks
   *  like. Helps Tim disambiguate when multiple candidates fit. */
  locator: string;
}

/**
 * Identify 3–5 distinct subjects in a photo Tim might want to look up.
 * Returns a candidate list for the picker UI; nothing is researched yet —
 * that happens in researchPhotoSubject once Tim picks one.
 */
export async function analyzePhotoCandidates(
  image: { mimeType: string; data: string },
  signal?: AbortSignal
): Promise<PhotoCandidate[]> {
  const prompt =
    "You are looking at a photo Tim took. Identify 3-5 distinct subjects in " +
    "the image that Tim might want to look up — animals, plants, objects, " +
    "buildings, dishes, vehicles, landmarks, signs, etc. Each should be " +
    "something Tim could plausibly be curious about, not background clutter. " +
    "Order them by how prominent / likely-of-interest they are.\n\n" +
    "Respond in EXACTLY this format, no preamble, no markdown:\n" +
    "SUBJECT: <short label, 1-4 words — e.g. \"Beale's eyed turtle\">\n" +
    "WHERE: <brief locator, 5-10 words — where in the image it is or what it looks like>\n" +
    "---\n" +
    "SUBJECT: <label>\n" +
    "WHERE: <locator>\n" +
    "---\n" +
    "(3-5 entries total, each separated by --- on its own line, no trailing ---)";

  const text = await analyzeScene({ prompt, images: [image], signal });
  const candidates: PhotoCandidate[] = [];
  // Split on a --- line; tolerate extra whitespace around it.
  const chunks = text.split(/^\s*---\s*$/m);
  for (const chunk of chunks) {
    const subjectMatch = chunk.match(/^\s*SUBJECT:\s*(.+?)\s*$/im);
    const whereMatch = chunk.match(/^\s*WHERE:\s*(.+?)\s*$/im);
    if (subjectMatch) {
      candidates.push({
        subject: subjectMatch[1].trim(),
        locator: whereMatch?.[1].trim() ?? "",
      });
    }
  }
  if (candidates.length === 0) {
    throw new Error(
      `analyzePhotoCandidates: couldn't parse any candidates. Raw: ${text.slice(0, 200)}`
    );
  }
  return candidates;
}

/**
 * Research a specific subject Tim picked from the candidate list. Re-attaches
 * the photo so Gemini can write context grounded in this particular shot
 * (e.g. acknowledging which variant / breed / model is visible) rather than
 * generic encyclopedia copy.
 */
export async function researchPhotoSubject(
  image: { mimeType: string; data: string },
  subject: string,
  signal?: AbortSignal
): Promise<string> {
  const prompt =
    `You are looking at a photo Tim took. Tim has indicated he wants to ` +
    `know about the "${subject}" visible in this image.\n\n` +
    `Write 3-4 sentences of factual context about ${subject} from your ` +
    `training knowledge. Cover: what is it, key distinguishing facts, ` +
    `where it's found or where it's from. If anything specific to THIS ` +
    `photo refines the answer (a particular breed, model year, species ` +
    `variant), mention that. Plain prose, no bullet points, no markdown, ` +
    `no preamble. Don't describe the photo itself — describe the subject.`;

  return analyzeScene({ prompt, images: [image], signal });
}

// ── generateQuickMessagesForCategory (flash) ─────────────────────
//
// Quick Messages are tap-to-send first-person messages Tim picks instead of
// typing. The UI presents six MODE-BASED categories
// (see constants/quickCategories.ts) — Location & Surroundings, Weather &
// Atmosphere, Mood & Feeling, Time & Rhythm, Local Life & Senses, Local
// History & Culture — and Gemini is asked for 4–7 messages at a time SCOPED
// to whichever category Tim tapped. No background batches; generation
// happens only on tap, with a short cache to absorb quick re-taps.
//
// Each message holds:
//   - `icon`:  single emoji shown on the row's circular dot
//   - `label`: short row title (≤ 40 chars)
//   - `body`:  the full sendable message — formatted as a single emote block
//              `_(*TEXT*)_` with NO surrounding dialog. Tim tapping a row
//              sends body verbatim through chatStore.sendMessage; the
//              EmoteAssembler will add its own ambient context on top
//              (`_(*ambient*)_ _(*Tim's chosen observation*)_`).

export interface QuickMessage {
  icon: string;
  label: string;
  body: string;
}

export interface GenerateQuickMessagesForCategoryInput {
  /** Plain-text sensor snapshot — same shape as assembleEmote. */
  sensorSnapshot: string;
  /** Which of the six mode-based categories to generate for. */
  categoryKey: import("@/constants/quickCategories").QuickCategoryKey;
  /** Recent message history to avoid suggestions Tim or Eli just touched on. */
  history?: Content[];
  /** Target count — 4–7. Defaults to 6. */
  count?: number;
  signal?: AbortSignal;
}

export async function generateQuickMessagesForCategory(
  input: GenerateQuickMessagesForCategoryInput
): Promise<QuickMessage[]> {
  const { getCategoryMeta } = await import("@/constants/quickCategories");
  const meta = getCategoryMeta(input.categoryKey);
  const count = Math.max(4, Math.min(7, input.count ?? 6));

  const prompt =
    `You are generating Quick Messages for Tim's "${meta.title}" category — ` +
    "tap-to-send first-person messages he picks instead of typing. He is " +
    "tapping NOW for THIS specific category, so every message you generate " +
    "must fit this category's focus and no other.\n\n" +
    `[CATEGORY FOCUS — ${meta.title}]\n${meta.promptFocus}\n\n` +
    "SCALE-OF-OBSERVATION — adapt to what Tim can actually see/do right now. " +
    "The activity field in the sensor snapshot drives scale:\n" +
    "  - activity = car: horizon-scale (skylines, distant features, the " +
    "road, the route). Tim glances and observes; he can't inspect.\n" +
    "  - activity = walking/running: sidewalk-scale (the storefront in front " +
    "of him, the texture of this block, smells from a doorway).\n" +
    "  - activity = still: ambient (the room, the view from here, settled).\n" +
    "  - unknown/mixed: default to the place's character (walkable downtown " +
    "→ walking; highway corridor → driving).\n\n" +
    "STRICT FORMAT RULES — read carefully, this is enforced:\n" +
    "- `body` is a SINGLE EMOTE BLOCK in the exact wrapper `_(*TEXT*)_`. " +
    "Note the leading underscore, opening paren, asterisk; then the text; " +
    "then asterisk, closing paren, trailing underscore. No other format is " +
    "valid. No surrounding dialog before or after — body IS the emote block " +
    "and nothing else.\n" +
    "- Inside the wrapper, write Tim's first-person action+observation in " +
    "present tense. Example for Location & Surroundings: " +
    "`_(*I slow down and take in the old brick buildings on Main Street. " +
    "Downtown Lynchburg has this stubborn small-town character.*)_`\n" +
    "- `label` is the SHORT row title (max 40 chars), written as a NOUN " +
    "PHRASE or SHORT GESTURE — what Tim is reaching for. Examples: " +
    "\"Old town character\" / \"Light off the courthouse\" / \"Settled in for " +
    "the morning\". NOT a topic-header — a thing-Tim-might-say.\n" +
    "- `icon` is ONE emoji that visually fits this specific message (not " +
    "the category's icon — vary it per-row so the list looks alive).\n" +
    "- Generate exactly " + count + " messages.\n" +
    "- DO NOT repeat topics from chat history.\n" +
    "- DO NOT mention Tim by name (he IS Tim).\n" +
    `- DO NOT mention ${companionName()}'s name in body (it's understood).\n\n` +
    "Respond as a single JSON object with key `suggestions` holding an " +
    "array. Each entry: { icon, label, body }. No preamble, no markdown " +
    "fence, just the JSON object.\n\n" +
    "[SENSOR SNAPSHOT]\n" +
    input.sensorSnapshot;

  const contents: Content[] = [
    ...(input.history ?? []),
    { role: "user", parts: [{ text: prompt }] },
  ];

  // 20s — generation of 4–7 short items on Flash is usually ~3-5s; 20s
  // leaves room for cellular slowness without freezing the popup. Uses
  // neutralFlash() — Quick Messages have their own full instruction inline,
  // so the Eli Bridge system prompt is dead weight here (same precedent as
  // condensePersonContext).
  const result = await withDeadline(
    withRetry(() => neutralFlash().generateContent({ contents })),
    20_000,
    `generateQuickMessages:${input.categoryKey}`,
    input.signal
  );
  const raw = result.response.text().trim();
  return parseQuickMessages(raw);
}

/**
 * Parse Gemini's JSON response. Tolerates markdown fence wrappers Gemini
 * occasionally adds despite the "no markdown" instruction, and filters out
 * malformed entries rather than throwing — a partial batch is better than
 * no Quick Messages at all.
 */
function parseQuickMessages(raw: string): QuickMessage[] {
  // Strip a ```json …``` fence if Gemini added one.
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const jsonText = fenced ? fenced[1] : raw;
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error(
      `generateQuickMessages: invalid JSON. Raw: ${raw.slice(0, 200)}`
    );
  }
  const arr = (parsed as { suggestions?: unknown }).suggestions;
  if (!Array.isArray(arr)) {
    throw new Error("generateQuickMessages: missing suggestions[] in response");
  }
  const valid: QuickMessage[] = [];
  for (const entry of arr) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Partial<QuickMessage>;
    if (
      typeof e.icon !== "string" ||
      typeof e.label !== "string" ||
      typeof e.body !== "string"
    ) {
      continue;
    }
    valid.push({
      icon: e.icon,
      label: e.label.slice(0, 60),
      body: normalizeEmoteBody(e.body),
    });
  }
  return valid;
}

/**
 * Force the body into the strict `_(*TEXT*)_` shape. Gemini occasionally
 * returns `(*…*)` (no underscores), `*(…)*`, or includes the wrapper twice;
 * the chat renderer + Eli's downstream parsing expect the canonical form, so
 * we coerce here rather than letting bad shapes leak into the store.
 *
 * Strategy: extract the inner text by stripping any combination of the
 * known emote wrappers, then re-wrap in the canonical `_(*TEXT*)_`.
 */
function normalizeEmoteBody(body: string): string {
  let text = body.trim();
  // Strip leading/trailing underscores
  text = text.replace(/^_+/, "").replace(/_+$/, "");
  // Strip leading `(* ` and trailing ` *)`
  text = text.replace(/^\(\*\s*/, "").replace(/\s*\*\)$/, "");
  // Strip any stray opening/closing wrapper that survived (paranoid)
  text = text.replace(/^_?\(\*\s*/, "").replace(/\s*\*\)_?$/, "");
  text = text.trim();
  return `_(*${text}*)_`;
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
 * Race a promise against a timeout AND (optionally) an external AbortSignal.
 * On timeout: rejects with a descriptive timeout error. On signal abort:
 * rejects immediately with an AbortError. The underlying Gemini SDK promise
 * keeps running in both cases (we can't kill its fetch from out here), but
 * the JS side stops awaiting it and the caller's generation guard prevents
 * stale writes if it eventually resolves.
 *
 * Used on operations that block UI transitions where waiting forever is
 * worse than a fallback message — notably draftJournal on session end and
 * the abort-button-driven cancellation path for sendMessage / playAi.
 */
function withDeadline<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
  signal?: AbortSignal
): Promise<T> {
  // Single choke point for every Gemini SDK call — emit one timeline trace
  // event here so each operation (assembleEmote, addAudioTags, analyzeScene,
  // draftJournal, …) shows its duration + outcome with no per-call-site work.
  // Debug level → hidden from the default Activity view, visible under "Full
  // trace". durationMs covers retries since `promise` wraps withRetry().
  const start = Date.now();
  // The underlying SDK promise keeps running after a timeout/abort settles the
  // outer promise, so its later resolution would emit a SECOND trace event.
  // `settled` ensures exactly one event per call — whichever outcome wins.
  let settled = false;
  const trace = (level: "debug" | "error", detail?: string) => {
    if (settled) return;
    settled = true;
    logApiCall({ subsystem: "gemini", label, durationMs: Date.now() - start, level, detail });
  };
  return new Promise<T>((resolve, reject) => {
    if (signal?.aborted) {
      trace("debug", "aborted before start");
      const e = new Error(`${label} aborted`);
      e.name = "AbortError";
      reject(e);
      return;
    }
    const timer = setTimeout(() => {
      cleanup();
      trace("error", `timed out after ${ms}ms`);
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
    const onAbort = () => {
      cleanup();
      trace("debug", "aborted");
      const e = new Error(`${label} aborted`);
      e.name = "AbortError";
      reject(e);
    };
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (v) => {
        cleanup();
        trace("debug");
        resolve(v);
      },
      (err) => {
        cleanup();
        trace("error", err instanceof Error ? err.message : String(err));
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
export interface AudioTagContext {
  /** The companion's own emote this turn — his own stage direction. */
  emoteContext?: string;
  /** The moment's mood. An INTENSITY DIAL, never a source of emotion. */
  mood?: { label: MoodLabel; energy: number; valence: number };
}

export async function addAudioTags(
  dialog: string,
  ctx: AudioTagContext = {},
  signal?: AbortSignal
): Promise<string> {
  if (!dialog.trim()) return dialog;

  const who = companionName();

  const prompt =
    `You are preparing ${who}'s dialog for ElevenLabs text-to-speech ` +
    "(model eleven_v3). Insert lowercase bracketed audio tags inline so the " +
    "delivery carries his actual feeling instead of reading flat.\n\n" +
    `[WHO IS SPEAKING]\n${_companionVoice || `${who} — an AI companion of Tim's.`}\n\n` +
    "[TAG VOCABULARY — eleven_v3]\n" +
    "Non-verbal: [laughs] [chuckles] [sighs] [exhales] [gasps] [stammers]\n" +
    "Emotional: [warmly] [softly] [gently] [thoughtful] [curious] [excited] " +
    "[delighted] [sad] [nervously] [frustrated] [angry] [sarcastic] [reassuring]\n" +
    "Delivery: [whispers] [quietly] [shouting] [rushed] [drawn out] [pause] " +
    "[long pause]\n" +
    "A tag placed immediately BEFORE a phrase colors the phrase that follows it.\n\n" +

    "[RULE 1 — TAGS MATCH THE SPEAKER, NOT THE ROOM]\n" +
    `The tags express what ${who} feels, read from his own emote and his own ` +
    `words. If ${who} is angry, he sounds angry. If he is delighted, he sounds ` +
    "delighted. If he is gently steadying Tim through something frightening, he " +
    "sounds gentle and steady — NOT frightened. Never make him sound like the " +
    "mood of the room. Make him sound like himself, inside that room.\n\n" +

    "[RULE 2 — THE MOMENT'S MOOD IS AN INTENSITY DIAL, NOTHING MORE]\n" +
    moodDirective(ctx.mood) +
    "\n\n" +

    "[RULE 3 — RESTRAINT]\n" +
    "- NEVER change a single word of the dialog. Only insert tags.\n" +
    "- 0–2 tags for a typical reply. 3 is the hard maximum. If nothing fits, " +
    "return the dialog completely unchanged — that is a correct and common " +
    "answer.\n" +
    "- Do not tag every sentence. Do not open every reply with a tag.\n" +
    "- Return ONLY the tagged dialog. No preamble, no quotes, no explanation.\n\n" +

    (ctx.emoteContext
      ? `[HIS EMOTE THIS TURN — his own stage direction, your primary signal]\n${ctx.emoteContext}\n\n`
      : "") +
    `[DIALOG]\n${dialog}`;

  // 30s — short prompt, near-instant Flash response in steady state, but
  // `withRetry`'s exponential backoff stacks up to ~14s on retries and the
  // previous 15s wall didn't leave room for one full retry cycle when
  // Gemini briefly returned 5xx. Tag injection failure isn't worth blocking
  // TTS playback; on timeout, the audioStore catch surfaces error and the
  // user can replay later.
  const result = await withDeadline(
    withRetry(() =>
      flash().generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      })
    ),
    30_000,
    "addAudioTags",
    signal
  );
  return result.response.text().trim();
}

/**
 * How the moment's mood modulates delivery. It tells the tagger HOW MUCH, never
 * WHAT — the emotion itself always comes from the companion's own emote (Rule 1).
 */
function moodDirective(mood?: {
  label: MoodLabel;
  energy: number;
  valence: number;
}): string {
  if (!mood || mood.label === "neutral") {
    return "The moment is unremarkable. Tag normally and sparingly.";
  }
  const band =
    mood.energy >= 0.66 ? "high" : mood.energy >= 0.33 ? "mid" : "low";
  const rule =
    band === "high"
      ? "The moment is highly activated. His delivery can carry more attack and less air — but he does not shout unless his own words call for it. ESCALATE his own emotion; never replace it."
      : band === "low"
        ? "The moment is quiet and still. Lean restrained: [softly], [quietly], [pause]. Silence is a tool. Under-tag here — one tag, or none."
        : "The moment is even. Tag normally.";
  return (
    `The room reads as "${mood.label}" — ${MOODS[mood.label].register}. ` +
    `(activation ${mood.energy.toFixed(2)}, pleasantness ${mood.valence.toFixed(2)}.)\n` +
    `${rule}\nThis tells you HOW MUCH, never WHAT. It never overrides Rule 1.`
  );
}

// ── condensePersonContext (flash, no Eli prompt) ─────────────────

let _neutralFlash: GenerativeModel | null = null;
function neutralFlash(): GenerativeModel {
  if (!_neutralFlash) {
    _neutralFlash = genAI().getGenerativeModel({ model: "gemini-2.5-flash" });
  }
  return _neutralFlash;
}

/**
 * One Flash call with NO Bridge system prompt and NO persona block.
 *
 * Exposed so session/coordinator.ts can keep its prompts next to the verifier
 * that checks their output — those two have to be read together to be understood,
 * and splitting them across files is how the format contract drifts.
 *
 * Persona-free is the point, not an economy. The coordinator packages one turn
 * for EACH member of the room, and `flash()` has exactly one companion's identity
 * baked into its systemInstruction — using it would write every kin's message in
 * whoever's persona happened to own the session.
 */
export async function neutralGenerate(
  prompt: string,
  opts: { deadlineMs: number; label: string; signal?: AbortSignal }
): Promise<string> {
  const result = await withDeadline(
    withRetry(() =>
      neutralFlash().generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      })
    ),
    opts.deadlineMs,
    opts.label,
    opts.signal
  );
  return result.response.text().trim();
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
 * Bridge system prompt — this is pure summarization, not emote assembly.
 */
export async function condensePersonContext(
  input: PersonContextInput
): Promise<string> {
  const limit = input.charLimit ?? 180;
  const who = companionName();
  const prompt =
    `You are helping ${who} — an AI companion — feel present in Tim's real life. ` +
    `Given a profile page for someone Tim is with right now, pick the 2–3 most ` +
    `contextually relevant facts about them for this specific moment. Avoid ` +
    `dumping biography; pick what would shape how ${who} understands this encounter. ` +
    `Return ONLY a compact phrase ≤${limit} characters, no lead-in, no quotes, ` +
    `no markdown.\n\n` +
    `[PERSON]\nName: ${input.name}\n` +
    (input.relationship ? `Relationship to Tim: ${input.relationship}\n` : "") +
    `\n[CURRENT SESSION]\n${input.sessionContext}\n\n` +
    `[PROFILE PAGE]\n${input.pageMarkdown}`;

  // 15s — pure summarization, fast in steady state. On timeout the caller
  // (personContext) returns the unfiltered profile, which is a graceful
  // degradation that doesn't block the send.
  const result = await withDeadline(
    withRetry(() =>
      neutralFlash().generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      })
    ),
    15_000,
    "condensePersonContext"
  );
  const out = result.response.text().trim();
  if (out.length <= limit) return out;
  return out.slice(0, limit).replace(/\s+\S*$/, "").trim() + "…";
}

// ── condenseEmote (flash) ────────────────────────────────────────

export async function condenseEmote(
  emoteText: string,
  charLimit: number,
  signal?: AbortSignal
): Promise<string> {
  const prompt = `The following emote block is ${emoteText.length} characters and must be trimmed to under ${charLimit} characters while keeping the Tier 1 scene intact. Cut Tier 3 critical-alert material first, then Tier 2 active-texture, then compress Tier 1 language if still over budget. Return ONLY the trimmed emote text, without the _(*...*)_ wrapper.\n\n[EMOTE]\n${emoteText}`;
  // 15s — fallback path; assembleEmote already has its own 30s budget so
  // this only runs when the first call returned an over-budget emote.
  const result = await withDeadline(
    withRetry(() =>
      flash().generateContent({ contents: [{ role: "user", parts: [{ text: prompt }] }] })
    ),
    15_000,
    "condenseEmote",
    signal
  );
  return result.response.text().trim();
}
