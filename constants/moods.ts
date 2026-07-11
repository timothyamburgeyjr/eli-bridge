import { C } from "./theme";

/**
 * Moment Mood — the emotional weather of Tim's present.
 *
 * Assembled from what's around him (place, weather, crowds, time of day), what
 * his body is doing, and how the conversation is going. It has two jobs:
 * it tints the app (a pulsing border + a badge), and it shapes the DICTION of
 * the emotes Gemini writes — a storm makes the words go ominous.
 *
 * Gemini picks a LABEL from this closed set. The app owns the color. Never let
 * the model emit a hex string.
 */
export type MoodLabel =
  | "neutral"
  | "serene"
  | "tender"
  | "bright"
  | "charged"
  | "wonder"
  | "melancholy"
  | "ominous";

export interface MoodDef {
  label: MoodLabel;
  emoji: string;
  /** Border + badge color. Hex string — everything downstream concatenates alpha. */
  color: string;
  /** Canonical anchor in valence/energy space; the decay target and the seed's default. */
  valence: number;
  energy: number;
  /** One-line diction guidance. Reused by the Gemini prompt AND by addAudioTags. */
  register: string;
  /** Emote text color: blended toward the house violet so it still reads as an emote. */
  emoteTint: string;
}

/**
 * Palette swept around the hue wheel at roughly matched perceptual lightness,
 * so no mood shouts louder than another on the #18161A AMOLED background, and
 * anchored on the house violet. `ominous` sits deliberately near C.red and
 * `charged` near C.amber — the app already speaks that color language.
 */
const RAW: Record<MoodLabel, Omit<MoodDef, "emoteTint">> = {
  neutral: {
    label: "neutral",
    emoji: "○",
    color: C.accent, // the app's normal self
    valence: 0,
    energy: 0.3,
    register: "your normal voice; no color applied",
  },
  serene: {
    label: "serene",
    emoji: "🌿",
    color: "#5FD3C4",
    valence: 0.5,
    energy: 0.2,
    register: "long vowels, slow clauses, stillness; nothing hurries",
  },
  tender: {
    label: "tender",
    emoji: "🫀",
    color: "#F2A0C0",
    valence: 0.6,
    energy: 0.3,
    register: "close focus, small details, warmth; the world narrows to arm's length",
  },
  bright: {
    label: "bright",
    emoji: "☀️",
    color: "#FFCE6B",
    valence: 0.7,
    energy: 0.55,
    register: "light, easy, a little funny; let the sentences breathe",
  },
  charged: {
    label: "charged",
    emoji: "⚡",
    color: "#FF8A3D",
    valence: 0.7,
    energy: 0.95,
    register: "short clauses, forward momentum, verbs doing the work",
  },
  wonder: {
    label: "wonder",
    emoji: "✧",
    color: "#7FD9FF",
    valence: 0.8,
    energy: 0.5,
    register: "scale words; what's big stays big; restraint, not gush",
  },
  melancholy: {
    label: "melancholy",
    emoji: "🌧",
    color: "#6C8BD6",
    valence: -0.6,
    energy: 0.25,
    register: "plain, quiet, unadorned; sadness gets smaller words, not bigger ones",
  },
  ominous: {
    label: "ominous",
    emoji: "🜂",
    color: "#E5544B",
    valence: -0.7,
    energy: 0.8,
    register: "low, ozone-and-iron register; the shadow-words, not horror-movie camp",
  },
};

/** Linear interpolation between two hex colors. Returns a plain hex string. */
export function blend(a: string, b: string, t: number): string {
  const pa = parseHex(a);
  const pb = parseHex(b);
  const mix = (x: number, y: number) => Math.round(x + (y - x) * t);
  const hex = (n: number) => n.toString(16).padStart(2, "0");
  return (
    "#" +
    hex(mix(pa[0], pb[0])) +
    hex(mix(pa[1], pb[1])) +
    hex(mix(pa[2], pb[2]))
  );
}

function parseHex(h: string): [number, number, number] {
  const s = h.replace("#", "");
  return [
    parseInt(s.slice(0, 2), 16),
    parseInt(s.slice(2, 4), 16),
    parseInt(s.slice(4, 6), 16),
  ];
}

/**
 * How far the emote text travels from the house violet toward the mood color.
 * A pure #E5544B italic body is a lot of red to read; 65% keeps it recognizably
 * an emote while clearly tinting it. Tunable — check it on the real AMOLED panel.
 */
export const EMOTE_TINT_STRENGTH = 0.65;

export const MOODS: Record<MoodLabel, MoodDef> = Object.fromEntries(
  Object.entries(RAW).map(([k, v]) => [
    k,
    { ...v, emoteTint: blend(C.emote, v.color, EMOTE_TINT_STRENGTH) },
  ])
) as Record<MoodLabel, MoodDef>;

export const MOOD_LABELS = Object.keys(MOODS) as MoodLabel[];

export function isMoodLabel(v: unknown): v is MoodLabel {
  return typeof v === "string" && v in MOODS;
}

/** A single read of the moment, from either producer. */
export interface MoodReading {
  label: MoodLabel;
  /** How good/bad this moment feels to Tim. -1 dread, +1 joy. */
  valence: number;
  /** How activated the moment is. 0 stillness, 1 adrenaline. Not happiness. */
  energy: number;
  confidence: number;
  /** 1–3 short strings naming the concrete evidence. Shown to Tim in the sheet. */
  sources: string[];
  origin: "sensor" | "gemini";
}

/**
 * Smoothing constants. Smooth the continuous, gate the discrete: the border
 * COLOR comes from the discrete label (must be stable and legible), the pulse
 * INTENSITY from continuous energy (should respond smoothly).
 */
export const MOOD_TUNING = {
  /** Scaled by confidence → effective alpha 0.09…0.35. */
  EMA_ALPHA_BASE: 0.35,
  /** Below this a reading is noise; discard it. */
  MIN_CONFIDENCE: 0.25,
  /** Consecutive wins a challenger label needs before it takes over. */
  LABEL_FLIP_STREAK: 2,
  /** Hard anti-flap floor between label changes. */
  MIN_LABEL_DWELL_MS: 45_000,
  /** …unless a reading is this confident AND this far away — a tornado warning
   *  should not have to wait out a 45-second dwell timer. */
  SNAP_CONFIDENCE: 0.8,
  SNAP_DISTANCE: 0.9,
  /** With no observation for this long, start drifting back toward neutral. */
  DECAY_AFTER_MS: 5 * 60_000,
  DECAY_FULL_MS: 20 * 60_000,
  /** Below this confidence, mood stops influencing emote color and audio tags. */
  APPLY_CONFIDENCE: 0.45,
  /** Readings kept for the badge's breakdown sheet. */
  HISTORY_CAP: 20,
} as const;
