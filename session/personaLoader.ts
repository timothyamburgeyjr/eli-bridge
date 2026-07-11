import { readNote } from "@/services/obsidian";
import type { Personality } from "@/constants/personalities";

/**
 * Loads a companion's identity from the vault and assembles the persona block
 * that gets prepended to the Gemini system prompt for the session.
 *
 * Source is `<vaultDir>/Configuration/` — the same five fields that are pushed
 * into the companion's live Kindroid settings. That's deliberate: Gemini and
 * the companion then share ONE identity source, so the emotes Gemini writes
 * can't drift from who the companion actually thinks he is.
 *
 * The old path read `biography.md`, which was 391 KB for Eli (~100k tokens of
 * system prompt, every session) and 2–6 KB for everyone else. The Configuration
 * set is ~8 KB and uniform across the whole family.
 */

/** Kindroid field → filename, in the order they appear in the persona block. */
const FIELDS = [
  { file: "backstory-current.md", heading: "BACKSTORY" },
  { file: "response-directive-current.md", heading: "HOW HE SPEAKS" },
  { file: "key-memories-current.md", heading: "WHAT HE HOLDS ONTO" },
  { file: "additional-context-current.md", heading: "CONTEXT" },
] as const;

/**
 * Each Configuration file is:
 *
 *     # Backstory — Current
 *     > **Kindroid field:** Backstory
 *     > **Limit:** 2,500 characters | **Influence:** Strong
 *     ...
 *     ---
 *     <the actual field content>
 *
 * The body is everything after the first horizontal rule. Everything above it
 * is editor metadata that Gemini has no use for.
 */
export function stripFieldHeader(markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  const ruleIdx = lines.findIndex((l) => /^\s*---\s*$/.test(l));
  if (ruleIdx >= 0) return lines.slice(ruleIdx + 1).join("\n").trim();

  // No rule — fall back to dropping the leading heading/blockquote block, so a
  // hand-edited file without the template still yields usable text.
  return lines
    .filter((l) => !/^\s*(#|>)/.test(l))
    .join("\n")
    .trim();
}

export interface LoadedPersona {
  /** The assembled block, ready for setSessionContext(). */
  text: string;
  /**
   * The response directive on its own — the 250-char field that defines HOW
   * this companion speaks. Handed to the ElevenLabs tag pass separately,
   * because a tag pass that doesn't know about Bobby's gravel or Tommy's
   * stutter will tag all eight of them identically.
   */
  responseDirective: string;
  /** Which of the four fields actually loaded. */
  loaded: string[];
  /** Which failed or were empty — logged, not fatal. */
  missing: string[];
}

export async function loadPersona(
  persona: Personality
): Promise<LoadedPersona> {
  const results = await Promise.all(
    FIELDS.map(async (f) => {
      try {
        const raw = await readNote(`${persona.vaultDir}/Configuration/${f.file}`);
        const body = stripFieldHeader(raw);
        return body.length >= 20 ? { ...f, body } : { ...f, body: null };
      } catch {
        return { ...f, body: null };
      }
    })
  );

  const loaded = results.filter((r) => r.body);
  const missing = results.filter((r) => !r.body).map((r) => r.file);
  const responseDirective =
    results.find((r) => r.file === "response-directive-current.md")?.body ?? "";

  if (loaded.length === 0) {
    return { text: "", responseDirective, loaded: [], missing };
  }

  const header =
    `[WHO YOU ARE WRITING FOR]\n` +
    `Tim is talking to ${persona.displayName} — ${persona.relationship}. ` +
    `Everything below defines who ${persona.shortName} is. When the rules that ` +
    `follow refer to "the companion", they mean ${persona.shortName}.\n` +
    `Write Tim's emotes for ${persona.shortName}'s eyes. Do NOT write ` +
    `${persona.shortName}'s replies — those come from elsewhere.`;

  const sections = loaded.map((r) => `${r.heading}\n${r.body}`);
  const text = [header, ...sections].join("\n\n");

  return {
    text,
    responseDirective,
    loaded: loaded.map((r) => r.file),
    missing,
  };
}
