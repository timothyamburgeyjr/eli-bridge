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
  /** Abort signal — wired into the deadline race so a user abort wakes us
   *  immediately instead of waiting out the full 30s budget. */
  signal?: AbortSignal;
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

  // 30s deadline — flash on this prompt typically returns in <3s. Anything
  // past 30s is almost certainly a network hang (cellular dead zone, etc.)
  // and we want to surface that as a "timeout" error so chatStore's
  // transient-error path queues the message for retry instead of locking
  // Drive Mode's overlay until the OS eventually severs the socket.
  const result = await withDeadline(
    withRetry(() => flash().generateContent({ contents })),
    30_000,
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

// ── generateQuickMessages (flash) ────────────────────────────────
//
// Quick Messages are Conversation-Mode-only suggestions Tim can tap to send
// pre-written first-person messages to Eli without typing. Gemini Flash
// generates 16 of them at a time based on the current sensor snapshot,
// recent location trajectory, time of day, and Gemini's own knowledge of
// the surrounding area (landmarks, history, regional culture).
//
// Each suggestion holds:
//   - `icon`:  single emoji shown on the card
//   - `label`: short tap-target text (≤ 40 chars)
//   - `body`:  the full first-person Tim message that gets sent on tap,
//              including embedded `*emote*` markers. Tim's normal asterisk
//              emotes flow through Gemini's send-time assembler as inline
//              emotes; the assembler's leading ambient emote (from sensors)
//              still gets prepended, so the final message reads as
//              `_(*ambient*)_ *Tim's micro-emote* dialog`.

export interface QuickMessage {
  icon: string;
  label: string;
  body: string;
  /** Coarse category for variety analysis. Currently informational only —
   *  Gemini emits it so we can avoid showing four "landmark" cards in a row. */
  category: "landmark" | "weather" | "traffic" | "history" | "ambient" | "banter" | "other";
}

export interface GenerateQuickMessagesInput {
  /** Plain-text sensor snapshot — same shape as assembleEmote. */
  sensorSnapshot: string;
  /** Optional running context: "headed west on I-44, 2h into the drive." */
  tripContext?: string;
  /** Recent message history to avoid suggestions Tim or Eli just touched on. */
  history?: Content[];
  /**
   * Target batch size. Used for first-generation. On refresh (when
   * `previousSuggestions` is supplied), Gemini is told to aim for this many
   * but is allowed to return fewer if the moment is quiet — so suggestions
   * don't pad out with stale filler. UI uses 16 (4 pages × 4).
   */
  count?: number;
  /**
   * If provided, this is a REFRESH. Gemini is told to review each prior
   * suggestion, KEEP the ones still relevant (copying them verbatim), DROP
   * the rest, and ADD new ones for topics that emerged since last gen. This
   * is what prevents the batch from being thrown out and rebuilt every
   * 90 seconds — relevant cards persist as long as they're still relevant.
   */
  previousSuggestions?: QuickMessage[];
  signal?: AbortSignal;
}

export async function generateQuickMessages(
  input: GenerateQuickMessagesInput
): Promise<QuickMessage[]> {
  const count = input.count ?? 16;
  const isRefresh = (input.previousSuggestions?.length ?? 0) > 0;

  const refreshGuidance = isRefresh
    ? "REFRESH MODE — you are receiving a PREVIOUS LIST of Quick Messages " +
      "Gemini generated for Tim earlier. Tim's context has shifted since " +
      "then (new location, weather, time, or activity).\n\n" +
      "Walk through each entry in PREVIOUS LIST and decide:\n" +
      "  - STILL RELEVANT? Copy it into your output VERBATIM — same icon, " +
      "label, body, category. Do NOT paraphrase.\n" +
      "  - NO LONGER RELEVANT (passed the landmark, weather moved on, ETA " +
      "is now stale, topic was already discussed)? Drop it.\n" +
      "Then ADD new suggestions for topics that emerged from the current " +
      "context — new landmarks visible, new weather, new region with its " +
      "own history, etc. New entries should not duplicate what you kept.\n\n" +
      `Aim for around ${count} total entries but DON'T pad with stale ideas ` +
      "to hit the count. A quiet rural drive might only sustain 5-6 " +
      "relevant suggestions; a downtown approach might justify 16. The " +
      "right number is what's genuinely useful right now.\n\n"
    : "FIRST GENERATION — no previous list. Generate a fresh batch from " +
      `the current context. Aim for ${count} entries.\n\n`;

  const prompt =
    "You are generating Quick Messages — pre-written first-person " +
    "observations Tim can tap to send to Eli, his AI companion, without " +
    "typing. Tim's hands or attention are otherwise occupied (driving, " +
    "walking, etc.), so each card needs to feel like something Tim would " +
    "naturally say in this exact moment.\n\n" +
    refreshGuidance +
    "SCALE-OF-OBSERVATION — match what Tim can actually SEE and DO right " +
    "now. The activity field in the sensor snapshot drives this:\n" +
    "  - activity = car (driving): horizon-scale observations. Highway " +
    "signs, distant skylines, billboards, bridges crossing rivers, ETA, " +
    "traffic flow, weather across the route, regional culture / history " +
    "of the area you're passing through, songs on the radio. Tim can't " +
    "stop to inspect anything — he glances and observes.\n" +
    "  - activity = walking or running: storefront-scale, sidewalk-scale " +
    "observations. Specific business names you can see from the sidewalk " +
    "(\"Dark Star Books is right here\"), cobblestones, foot traffic, " +
    "smells from a café, conversations from passing groups, the feel of " +
    "the weather on skin, things you could WALK INTO and inspect. Slower " +
    "and more deliberate than driving — Tim has time to look around.\n" +
    "  - activity = still: ambient observations from where Tim is sitting " +
    "or standing. The light in the room, sounds, who else is around, " +
    "what's on screens or surfaces nearby. Less about movement, more " +
    "about settling in.\n" +
    "  - Unknown / mixed activity: lean toward the most-recent place-name " +
    "context. If it's a walkable downtown, default to walking scale. If " +
    "it's a highway corridor, default to driving scale.\n\n" +
    "Topics across activities (pick varied ones per batch):\n" +
    "- Landmarks / visible features at the appropriate scale\n" +
    "- Weather (current, change, alert)\n" +
    "- History or trivia about where Tim is — lean into this; your " +
    "training has more depth than Tim does on most places, and a " +
    "historical/cultural beat lands the same whether walking or driving\n" +
    "- Ambient observations (sky, light, sound, smell, foot traffic)\n" +
    "- Conversation starters (something to ask Eli)\n\n" +
    "RULES:\n" +
    "- First person, Tim's voice, present tense\n" +
    "- Each `body` must include ONE inline `*action*` emote, then dialog. " +
    "Example: `*I glance out at the bend in the river* The Mississippi " +
    "looks wider than I remembered, Eli.`\n" +
    "- `label` is the SHORT card text (max 40 chars). Sentence fragments — " +
    "\"We're passing the Gateway Arch\" / \"It just started raining here\" / " +
    "\"This is Mark Twain country\". Used in the compact Conversation Mode " +
    "cards.\n" +
    "- The `body` is what gets SENT and is also displayed in the main-chat " +
    "popup. Write it as a complete, send-ready sentence (or two).\n" +
    "- Pick ONE emoji per card that fits the topic\n" +
    "- DO NOT repeat what's already in chat history\n" +
    "- DO NOT include _(*…*)_ wrapper format; only single asterisks for the " +
    "inline emote\n" +
    "- DO NOT mention Tim by name in the body (he IS Tim)\n\n" +
    "Respond as a single JSON object with key `suggestions` holding an array. " +
    "Each entry: { icon, label, body, category }. category ∈ {landmark, " +
    "weather, traffic, history, ambient, banter, other}. No preamble, no " +
    "markdown fence, just the JSON object.\n\n" +
    "[SENSOR SNAPSHOT]\n" +
    input.sensorSnapshot +
    (input.tripContext ? `\n\n[TRIP CONTEXT]\n${input.tripContext}` : "") +
    (isRefresh
      ? `\n\n[PREVIOUS LIST — review for relevance]\n${JSON.stringify(
          input.previousSuggestions,
          null,
          2
        )}`
      : "");

  const contents: Content[] = [
    ...(input.history ?? []),
    { role: "user", parts: [{ text: prompt }] },
  ];

  // 20s — generation of 16 short items on Flash is usually ~3-5s; 20s leaves
  // room for cellular slowness without freezing the Conversation Mode UI.
  //
  // Uses neutralFlash() — a Flash instance without the Eli Bridge system
  // instruction. The 9k-token emote-assembly prompt is dead weight here:
  // Quick Messages have their own full instruction inline (above), and
  // Gemini doesn't need to know Eli's persona or the emote conventions to
  // generate a JSON list of tap-to-send cards. Skipping the system prompt
  // cuts per-call input from ~11k tokens to ~2k tokens (~5x cheaper).
  // Same precedent: condensePersonContext does the same thing for the same
  // reason — pure summarization, no Eli context required.
  const result = await withDeadline(
    withRetry(() => neutralFlash().generateContent({ contents })),
    20_000,
    "generateQuickMessages",
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
  } catch (err) {
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
      body: e.body,
      category: (e.category as QuickMessage["category"]) ?? "other",
    });
  }
  return valid;
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
 * the abort-button-driven cancellation path for sendMessage / playEli.
 */
function withDeadline<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
  signal?: AbortSignal
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal?.aborted) {
      const e = new Error(`${label} aborted`);
      e.name = "AbortError";
      reject(e);
      return;
    }
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
    const onAbort = () => {
      cleanup();
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
        resolve(v);
      },
      (err) => {
        cleanup();
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
  emoteContext?: string,
  signal?: AbortSignal
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

  // 15s — short prompt, near-instant Flash response in steady state. Tag
  // injection failure isn't worth blocking TTS playback; on timeout, the
  // audioStore catch will surface error and the user can replay later.
  const result = await withDeadline(
    withRetry(() =>
      flash().generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      })
    ),
    15_000,
    "addAudioTags",
    signal
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
