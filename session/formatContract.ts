/**
 * The format contract — the exact shape of a message on the wire, and the code
 * that checks we honoured it.
 *
 * This module imports NOTHING. That is deliberate and worth preserving: the
 * contract is pure string logic, and keeping it free of React Native, of the
 * Gemini client, and of app config is what makes it possible to actually test.
 * Movie Mode learned this the hard way — the contract kept silently breaking,
 * and the fix that finally held was pinning it with cases you can run.
 *
 * ─── THE CONTRACT ───
 *
 *   Tim's dialogue        → raw text, outside every emote
 *   everything else       → inside `_(* ... *)_`, one block per paragraph
 *   another kin's speech  → third person, their words quoted:
 *       _(* Bobby squints at the sign and says, "That can't be right." *)_
 *
 * There is ONE correct markup. Not (*this*). Not _*this*_. Not *this*.
 */

/**
 * Prepended to every outgoing Kindroid message.
 *
 * Note this is itself a NESTED emote — it quotes the very markup it describes.
 * That is intentional (a working demonstration beats a description), and it is
 * also a trap: {@link EMOTE_RE} is non-greedy, so it matches only as far as the
 * INNER `*)_` and leaves `notation *)_` behind as apparent stray markup. Anything
 * scanning a body for malformed emotes has to lift the directive out whole first,
 * or the directive fails its own rule. See {@link verifyPacket}.
 */
export const FORMAT_DIRECTIVE =
  "_(* DIRECTIVE: All Emotes have to go inside the _(* TEXT *)_ notation *)_";

export const EMOTE_RE = /_\(\*\s*([\s\S]*?)\s*\*\)_/g;

export interface Segment {
  type: "emote" | "dialog";
  text: string;
}

/** The minimum a recipient has to be for the contract to address them. */
export interface Recipient {
  key: string;
  shortName: string;
}

/** What one companion already said this turn — raw material for the next one's payload. */
export interface PriorReply {
  /** Short name. The packager writes them in the third person by it. */
  name: string;
  /** Their emote text, wrappers already stripped. */
  emote: string;
  /** Their spoken words. Quoted verbatim into the next companion's narration. */
  spoken: string;
}

// ── Parsing ───────────────────────────────────────────────────────

export function parseSegments(raw: string): Segment[] {
  const segments: Segment[] = [];
  let last = 0;
  EMOTE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = EMOTE_RE.exec(raw)) !== null) {
    if (m.index > last) {
      const t = raw.slice(last, m.index);
      if (t.trim()) segments.push({ type: "dialog", text: t.trim() });
    }
    if (m[1].trim()) segments.push({ type: "emote", text: m[1].trim() });
    last = m.index + m[0].length;
  }
  if (last < raw.length) {
    const t = raw.slice(last);
    if (t.trim()) segments.push({ type: "dialog", text: t.trim() });
  }
  return segments;
}

/**
 * Convert Tim's single-asterisk emotes `*action*` into Bridge emote wrappers
 * `_(*action*)_`. Sentence-terminating punctuation (`.`, `!`, `?`) immediately
 * after the closing asterisk is absorbed INTO the emote so it reads as a
 * complete thought rather than leaving a leading period in the dialog that
 * follows. Double-asterisk markdown `**bold**` is left alone.
 *
 *   "*walks to the kitchen*. I'm making coffee"
 *     → "_(*walks to the kitchen.*)_ I'm making coffee"
 */
export function convertTimAsterisksToEmotes(input: string): string {
  return input.replace(
    /(?<!\*)\*([^*\n]+?)\*([.!?])?(?!\*)/g,
    (_, inner: string, punct?: string) => `_(*${inner}${punct ?? ""}*)_`
  );
}

/**
 * Dialog only, every `_(*emote*)_` block stripped. Feeds ElevenLabs — emotes are
 * never spoken aloud.
 */
export function extractSpokenText(raw: string): string {
  return parseSegments(raw)
    .filter((s) => s.type === "dialog")
    .map((s) => s.text)
    .join(" ")
    .trim();
}

/** Every emote block, unwrapped, joined by " | ". Context for the audio-tag pass. */
export function extractEmoteContext(raw: string): string {
  return parseSegments(raw)
    .filter((s) => s.type === "emote")
    .map((s) => s.text)
    .join(" | ")
    .trim();
}

/** Split a companion's raw reply into the shape the next companion's payload needs. */
export function replyToPrior(name: string, raw: string): PriorReply {
  const segs = parseSegments(raw);
  const join = (t: Segment["type"]) =>
    segs
      .filter((s) => s.type === t)
      .map((s) => s.text)
      .join(" ")
      .trim();
  return { name, emote: join("emote"), spoken: join("dialog") };
}

/**
 * What's already been said this turn.
 *
 * This is the ONLY thing that makes a room a room. There is no shared context
 * between two Kindroid AIs — Bobby's payload containing Eli's reply is literally
 * what it means for Bobby to have heard Eli. If it isn't in the text, it didn't
 * happen.
 */
export function renderPrior(prior: PriorReply[]): string {
  if (prior.length === 0) return "(nobody has spoken yet this turn)";
  return prior
    .map((p) => {
      const bits: string[] = [];
      if (p.emote) bits.push(`[did] ${p.emote}`);
      if (p.spoken) bits.push(`[said, verbatim] "${p.spoken}"`);
      return bits.length ? `${p.name}: ${bits.join(" ")}` : "";
    })
    .filter(Boolean)
    .join("\n");
}

// ── Normalisation ─────────────────────────────────────────────────

/**
 * Fold typographic variants so a verbatim check isn't a byte-exact check.
 *
 * An LLM renders `don't` with a CURLY apostrophe; Tim types a straight one. Movie
 * Mode's verifier compared raw substrings, so every message containing an
 * apostrophe — which is most of them — was rejected as "Tim's dialogue was
 * altered" and silently fell back to the crude mechanical payload. That disabled
 * the entire packaging layer for most of a night before anyone noticed, and the
 * bug was in TWO places: fixing one left it still failing, just with a different
 * message.
 *
 * Normalise before comparing. Always.
 */
const SMART: Record<string, string> = {
  "‘": "'", "’": "'", "‚": "'", "‛": "'",
  "“": '"', "”": '"', "„": '"', "‟": '"',
  "–": "-", "—": "-", "−": "-",
  "…": "...", " ": " ",
};

export function norm(text: string): string {
  let out = text;
  for (const bad of Object.keys(SMART)) out = out.split(bad).join(SMART[bad]);
  return out.split(/\s+/).filter(Boolean).join(" ").toLowerCase();
}

/**
 * As {@link norm}, but punctuation-blind.
 *
 * For the OVERHEARD path, where Tim's words are QUOTED inside narration — the
 * model will quite reasonably add a comma or a full stop inside the quotation
 * marks. The words are what matter, not the punctuation around them.
 */
export function normLoose(text: string): string {
  return norm(text).replace(/[^\w\s]/g, " ").split(/\s+/).filter(Boolean).join(" ");
}

// ── Verification ──────────────────────────────────────────────────

/**
 * Did the model honour the contract? Returns a reason, or null if clean.
 *
 * The failure modes are silent and expensive: a paraphrased Tim reads as Tim
 * saying something he never said, and a bare `*star*` leaks raw markup into a
 * companion's face. Cheaper to check than to debug in the field.
 *
 * Pass `dialogue: ""` for a recipient who merely OVERHEARD the remark — their
 * payload must NOT contain Tim's words as raw text, so the verbatim-raw rule does
 * not apply to them. (Their own check, that his words survived inside the
 * narration, is punctuation-blind and lives in the caller.)
 */
export function verifyPacket(
  body: string,
  opts: { dialogue: string; limit: number }
): string | null {
  if (!body.trim()) return "empty body";
  if (body.length > opts.limit) {
    return `over the limit (${body.length} > ${opts.limit})`;
  }

  const typed = opts.dialogue.trim();

  // Tim's words must survive intact. Compare normalised, so a curly apostrophe
  // isn't mistaken for a rewrite — while still catching an actual paraphrase.
  if (typed && !norm(body).includes(norm(typed))) {
    return "Tim's dialogue was altered or dropped";
  }

  // Lift the nested FORMAT_DIRECTIVE out WHOLE before scanning — see its doc.
  let remainder = body.split(FORMAT_DIRECTIVE).join("");
  remainder = remainder.replace(EMOTE_RE, "");

  // A surviving lone asterisk means an emote was written in the wrong dialect
  // (`*text*`, `(*text*)`), which Kindroid renders as visible junk.
  if (remainder.includes("*")) {
    return "malformed emote markup outside a _(*...*)_ block";
  }

  // Whatever is left outside the emotes should be Tim's line and nothing else.
  //
  // His line can ITSELF contain emotes: he types `*shrugs*` and the Bridge
  // converts it to `_(*shrugs*)_` before it ever gets here. Those were stripped
  // from `remainder` along with every other emote above, so the leftover has to
  // be compared against his SPOKEN words alone — subtracting the full line,
  // markup and all, would never match, and every such message would be rejected.
  let leftover = norm(remainder);
  if (typed) {
    const spokenOnly = norm(typed.replace(EMOTE_RE, " "));
    if (spokenOnly && leftover.includes(spokenOnly)) {
      leftover = leftover.replace(spokenOnly, "").trim();
    }
  }
  if (leftover) {
    return `unwrapped text outside an emote: ${JSON.stringify(leftover.slice(0, 80))}`;
  }
  return null;
}

// ── The mechanical fallback ───────────────────────────────────────

export interface MechanicalInput {
  kin: Recipient;
  /** The world this turn — narration. */
  scene: string;
  presentAnchor?: string | null;
  /** Tim's words, verbatim. */
  dialogue: string;
  prior: PriorReply[];
  /** Short names of whoever Tim was actually talking to. Empty = the room at large. */
  addressedNames: string[];
  limit: number;
}

/**
 * The payload we send when the model's packet fails verification.
 *
 * IT MUST BE SAFE, not merely simple. In Movie Mode the fallback put Tim's words
 * in raw regardless of who it was addressing — which reintroduced the entire
 * Kiddo bug through the back door every single time a packet got rejected.
 * Hardening the happy path is not enough. If the degraded path doesn't honour the
 * same rule, the bug hasn't been fixed, it has only moved.
 */
export function mechanicalPayload(input: MechanicalInput): string {
  const { kin, scene, presentAnchor, dialogue, prior, addressedNames, limit } = input;
  const spokenTo =
    addressedNames.length === 0 || addressedNames.includes(kin.shortName);

  const parts: string[] = [FORMAT_DIRECTIVE];
  if (presentAnchor) parts.push(presentAnchor);
  if (scene.trim()) parts.push(`_(* ${oneLine(scene)} *)_`);

  for (const p of prior) {
    const bits: string[] = [];
    if (p.emote) bits.push(oneLine(p.emote));
    if (p.spoken) bits.push(`${p.name} says, "${oneLine(p.spoken)}"`);
    if (bits.length) parts.push(`_(* ${bits.join(". ")} *)_`);
  }

  if (dialogue.trim()) {
    if (spokenTo) {
      // Addressed: raw, verbatim, last. The ONLY case where that is correct.
      parts.push(dialogue.trim());
    } else {
      // Overheard: quoted inside narration, naming who it was aimed at. Never raw.
      parts.push(
        `_(* Tim turns to ${joinNames(addressedNames)} and says, "${oneLine(dialogue)}" *)_`
      );
    }
  }

  return clampToLimit(parts.join("\n"), limit, dialogue.trim().length > 0);
}

/** Emotes cannot contain a blank line — Kindroid's renderer leaks the markup. */
function oneLine(s: string): string {
  return s.replace(/\s*\n+\s*/g, " ").trim();
}

export function joinNames(names: string[]): string {
  if (names.length === 0) return "the others";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

/**
 * Trim to the cap by dropping whole narration blocks from the FRONT — oldest
 * context first. Tim's dialogue is never touched: rule 6, his voice is law. If
 * even the directive plus his words won't fit, send it anyway and let the
 * kindroid service's own guard throw. A loud failure beats a silently truncated Tim.
 */
function clampToLimit(body: string, limit: number, hasDialogue: boolean): string {
  if (body.length <= limit) return body;
  const lines = body.split("\n");
  const tail = hasDialogue ? 1 : 0;
  while (body.length > limit && lines.length > 1 + tail) {
    lines.splice(1, 1); // oldest narration, after the directive
    body = lines.join("\n");
  }
  return body;
}
