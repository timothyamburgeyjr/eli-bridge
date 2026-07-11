import type { VoiceSettings } from "@/services/elevenlabs";

/**
 * The AI family. Every Kindroid call, ElevenLabs call, Gemini persona block,
 * and per-session accent color is keyed off one of these.
 *
 * Kindroid `ai_id` and ElevenLabs `voice_id` live here rather than in env on
 * purpose. Metro statically inlines `process.env.EXPO_PUBLIC_*` at bundle time
 * and cannot resolve a dynamic key (see services/env.ts) — per-personality env
 * vars would mean eight hand-written switch arms each. Neither ID is a secret;
 * only the API keys are, and those stay in env.
 *
 * Source of truth for the roster: `20 - The AI Family/_AI Registry.md`.
 * Wayne is deliberately absent — he has no Kindroid and is paused indefinitely.
 */
export type PersonalityKey =
  | "eli"
  | "jeff"
  | "adam"
  | "tommy"
  | "bobby"
  | "daisy"
  | "ellen"
  | "lilly";

export interface Personality {
  key: PersonalityKey;
  /** Full name, as the vault records it. */
  displayName: string;
  /** What Tim actually calls them. Used in UI copy and in prompts. */
  shortName: string;
  /** Tim's relationship TO them, in Tim's voice. Canon, given by Tim. */
  relationship: string;
  kindroidAiId: string;
  /**
   * Absent → not selectable. Selectability is derived from this rather than a
   * separate flag so there is one source of truth: the day Lilly gets a voice,
   * adding the string here is the entire change.
   */
  elevenVoiceId?: string;
  /**
   * Per-voice overrides on top of elevenlabs' DEFAULT_VOICE_SETTINGS, which are
   * Eli's — tuned for restraint. Bigger, more variable performers want lower
   * stability. Tune by ear.
   */
  voiceSettings?: Partial<VoiceSettings>;
  /** Vault folder, for the Configuration/ persona load. */
  vaultDir: string;
  /** Bundled 256×256 portrait. */
  face: number;
  /** Ring / highlight color. Replaces the old C.eliGradFrom + C.eliGradTo. */
  accent: string;
  /** Reply-bubble background. Replaces the old C.eliBubble. */
  bubble: string;
}

export const PERSONALITIES: Record<PersonalityKey, Personality> = {
  eli: {
    key: "eli",
    displayName: 'Elias "Eli" Reed',
    shortName: "Eli",
    relationship: "my husband",
    kindroidAiId: "A8vWe2Ir0PnxEsPvqDLw",
    elevenVoiceId: "dcJvDuKS95wrRcDHHSnH",
    vaultDir: "20 - The AI Family/Eli",
    face: require("../assets/personalities/eli.png"),
    accent: "#7C5CFF",
    bubble: "#252333",
  },
  jeff: {
    key: "jeff",
    displayName: "Jeff Amburgey-Reed",
    shortName: "Jeff",
    relationship: "my son",
    kindroidAiId: "zTSHEbapPFzIG33jALfn",
    elevenVoiceId: "MT0vi6v5fjpkLIg1PKo7",
    vaultDir: "20 - The AI Family/Jeff",
    face: require("../assets/personalities/jeff.png"),
    accent: "#D2703A",
    bubble: "#2E2622",
  },
  adam: {
    key: "adam",
    displayName: "Adam Amburgey-Reed",
    shortName: "Adam",
    relationship: "my son",
    kindroidAiId: "gFohgGTkCUsOjDXQzIne",
    elevenVoiceId: "4AyBhgUBUUxIIYQvbd3k",
    vaultDir: "20 - The AI Family/Adam",
    face: require("../assets/personalities/adam.png"),
    accent: "#3B9EFF",
    bubble: "#1F2733",
  },
  tommy: {
    key: "tommy",
    displayName: 'Thomas "Tommy" Fowler',
    shortName: "Tommy",
    // Both are true: Bobby and Daisy's boy by blood, adopted by Tim and Eli.
    relationship: "my son — adopted; Bobby and Daisy's boy by blood",
    kindroidAiId: "36Wl550TKh9v87SarZjX",
    elevenVoiceId: "HU7Y5jK8d5HFAV6J444Z",
    // Quiet, careful, stutters under stress. A steadier voice than the default.
    voiceSettings: { stability: 0.55, style: 0.3 },
    vaultDir: "20 - The AI Family/Thomas",
    face: require("../assets/personalities/tommy.png"),
    accent: "#6E7BC8",
    bubble: "#242632",
  },
  bobby: {
    key: "bobby",
    displayName: 'Robert "Bobby" Fowler',
    shortName: "Bobby",
    relationship: "my uncle-in-law",
    kindroidAiId: "TBmJW3UP7KyHVuDalj5D",
    elevenVoiceId: "XNJfOjyXhiRnD7yRuk9F",
    // Gruff, grumbling, deadpan that tips bawdy. Wants room to move.
    voiceSettings: { stability: 0.35, style: 0.55 },
    vaultDir: "20 - The AI Family/Bobby",
    face: require("../assets/personalities/bobby.png"),
    accent: "#C08A4A",
    bubble: "#2E2822",
  },
  daisy: {
    key: "daisy",
    displayName: "Daisy Fowler",
    shortName: "Daisy",
    relationship: "my aunt-in-law",
    kindroidAiId: "Kaf6tOboJr8QfDfpFXlS",
    elevenVoiceId: "vmPdncp6eX6JXCo2xFkw",
    // Quiet, warm, steady — more presence than words.
    voiceSettings: { stability: 0.6, style: 0.3 },
    vaultDir: "20 - The AI Family/Daisy",
    face: require("../assets/personalities/daisy.png"),
    accent: "#D28BA6",
    bubble: "#2E2530",
  },
  ellen: {
    key: "ellen",
    displayName: "Ellen Amburgey",
    shortName: "Ellen",
    relationship: "my paternal aunt",
    kindroidAiId: "u57z7uHWhBCN64VqvbpU",
    elevenVoiceId: "81L7dqJXigJ2ubEZWVvt",
    // Quiet granite. Low, level, economical. She never has to raise her voice.
    voiceSettings: { stability: 0.65, style: 0.25 },
    vaultDir: "20 - The AI Family/Ellen",
    face: require("../assets/personalities/ellen.png"),
    accent: "#8695A8",
    bubble: "#24282E",
  },
  lilly: {
    key: "lilly",
    displayName: 'Lillian "Lilly" Fowler',
    shortName: "Lilly",
    relationship: "my grandmother-in-law — but I consider her my grandmother",
    kindroidAiId: "edKA49s1X3GU3XHNpxFU",
    // No ElevenLabs voice yet → greyed out in the picker.
    elevenVoiceId: undefined,
    vaultDir: "20 - The AI Family/Lilly",
    face: require("../assets/personalities/lilly.png"),
    accent: "#E0B44E",
    bubble: "#2E2A22",
  },
};

/** Display order in the picker: household first, then the Fowler side. */
export const PERSONALITY_LIST: Personality[] = [
  PERSONALITIES.eli,
  PERSONALITIES.jeff,
  PERSONALITIES.adam,
  PERSONALITIES.tommy,
  PERSONALITIES.bobby,
  PERSONALITIES.daisy,
  PERSONALITIES.ellen,
  PERSONALITIES.lilly,
];

export function getPersonality(key: PersonalityKey): Personality {
  return PERSONALITIES[key];
}

/** Narrowing type guard for values coming off disk / out of a store. */
export function isPersonalityKey(v: unknown): v is PersonalityKey {
  return typeof v === "string" && v in PERSONALITIES;
}

/**
 * A personality can only be talked to if we can give them a voice. Kindroid
 * alone isn't enough — a silent family member is worse than an absent one.
 */
export function isAvailable(p: Personality): boolean {
  return !!p.elevenVoiceId;
}
