/**
 * Quick Messages categories — the six conversational gestures Tim picks
 * between when he wants to start a thread with Eli but doesn't want to type.
 *
 * These are MODE-based, not topic-based. Each represents a different *kind of
 * being-with* — observe, comment on atmosphere, share a feeling, anchor to
 * time, sense the small life around, draw on local history. The Gemini
 * generator is parameterized by `key` and uses `promptFocus` to scope what it
 * produces. The Categories popup uses `icon` + `title` + `description` as the
 * row.
 *
 * Keep this file the single source of truth — UI, prompt, store-cache keys
 * all import from here, so renaming a category is a one-spot change.
 */

export type QuickCategoryKey =
  | "location-surroundings"
  | "weather-atmosphere"
  | "mood-feeling"
  | "time-rhythm"
  | "local-life-senses"
  | "local-history-culture";

export interface QuickCategoryMeta {
  key: QuickCategoryKey;
  /** Emoji shown in the row's circular icon on the Categories popup. */
  icon: string;
  /** Display name. */
  title: string;
  /** One-line subtitle under the title in the Categories popup. */
  description: string;
  /**
   * Category-specific guidance fed to Gemini. Tells the model what KIND of
   * messages to generate for this category — the constraint that gives each
   * category its identity even though they share the same base prompt.
   */
  promptFocus: string;
}

export const QUICK_CATEGORIES: readonly QuickCategoryMeta[] = [
  {
    key: "location-surroundings",
    icon: "📍",
    title: "Location & Surroundings",
    description:
      "Noticing places, buildings, streets, and landmarks around you.",
    promptFocus:
      "VISUAL OBSERVATIONS of what Tim can see right now. Buildings, streets, " +
      "storefronts, signs, the layout of the place, landmarks, what's coming " +
      "into view next. Match the scale to his activity: driving = horizon-scale " +
      "(skylines, distant features, billboards); walking = sidewalk-scale " +
      "(individual shops, the texture of a block, cobblestones); still = " +
      "ambient (the room, the view from here). Each message is Tim saying " +
      "\"look at this\" — pointing at something concrete and visible. Avoid " +
      "weather (separate category), avoid history (separate category).",
  },
  {
    key: "weather-atmosphere",
    icon: "🌤️",
    title: "Weather & Atmosphere",
    description:
      "Comments about the sky, temperature, light, and the feel of the air.",
    promptFocus:
      "Comments on the SKY, light quality, temperature, humidity, wind, smell " +
      "of the air, the feel of the season, what the weather is doing right " +
      "now or about to do. Use the live sensor temp + conditions to ground " +
      "this. Each message is Tim noticing or commenting on atmospheric " +
      "qualities — not visual landmarks (separate category) and not the " +
      "broader rhythm of the day (separate category). Examples: \"the light " +
      "has that pre-storm flatness\" / \"first cold morning in weeks\" / " +
      "\"the air smells like wet asphalt\".",
  },
  {
    key: "mood-feeling",
    icon: "😌",
    title: "Mood & Feeling",
    description:
      "Share how the moment feels emotionally or personally.",
    promptFocus:
      "EMOTIONAL OPENERS — Tim can't have his mood detected by sensors, so " +
      "each message is an INVITATION TO SHARE A SPECIFIC FEELING that's " +
      "plausible for THIS moment. Use location + time-of-day + day-of-week + " +
      "weather + recent chat tone to infer 4–7 *probable* moods for Tim right " +
      "now, and emit one opener per mood. Sunday morning at home → maybe " +
      "settled/slow-start/contemplative/missing-something. Friday evening in " +
      "a parking lot after errands → wound-down / done-with-this-week / " +
      "ready-to-just-be. Mid-drive on a quiet rural road → meditative / " +
      "restless / want-to-talk. Each opener is one line in Tim's voice that " +
      "invites Eli into that feeling. Tim picks the one that fits and skips " +
      "the others.",
  },
  {
    key: "time-rhythm",
    icon: "⏰",
    title: "Time & Rhythm",
    description:
      "Messages tied to the time of day and the pace of the moment.",
    promptFocus:
      "Messages anchored to WHEN it is — time-of-day, day-of-week, pace of " +
      "the moment. Not clock-time announcements (\"it's 8:25\") but the " +
      "*feel* of being in this slice of the day: \"the part of Sunday where " +
      "the day starts to feel real\" / \"almost lunch\" / \"the back half of " +
      "the week\" / \"early enough the world is still soft\" / \"this " +
      "stretch where nothing's open yet\". Also pace: rushing vs. drifting, " +
      "long stretches vs. quick errands. Use recent chat history to sense " +
      "whether the day has been busy or slow.",
  },
  {
    key: "local-life-senses",
    icon: "🎧",
    title: "Local Life & Senses",
    description:
      "Sounds, smells, and little signs of life happening nearby.",
    promptFocus:
      "The NON-VISUAL layer of the place — sounds, smells, and small " +
      "evidences of other people's lives happening nearby. We can't detect " +
      "these from sensors, so INFER PLAUSIBLE sensory texture from place + " +
      "time + day-of-week + weather + season. Lean toward common, high-" +
      "probability elements so Tim's hit-rate is high (he picks the ones " +
      "that match what he's actually hearing/smelling, skips the rest). " +
      "Examples: small-town Saturday morning → riding mower somewhere, " +
      "distant dog, smell of cut grass, breakfast cooking from open " +
      "windows. Downtown weekday lunch → restaurant exhaust, traffic, " +
      "snippets of conversation. Evening parking lot in summer → cicadas, " +
      "asphalt heat, distant car stereos. Phrase each one in Tim's voice " +
      "as a thing he's catching wind of.",
  },
  {
    key: "local-history-culture",
    icon: "🏛️",
    title: "Local History & Culture",
    description:
      "Historic context, town identity, and cultural observations.",
    promptFocus:
      "Trivia, lore, and identity of THIS SPECIFIC PLACE — founding history, " +
      "how the place got its name, who's from here, why a street is named " +
      "what it is, the cultural texture (what the town is *like* as a town), " +
      "industries that shaped it, local sayings or quirks. Lean on the " +
      "resolved place name + the broader region. Each message is Tim asking " +
      "Eli to share or riff on a piece of place-lore, or Tim noting " +
      "something cultural he's aware of (\"this is Mark Twain country\" / " +
      "\"feels like the town hasn't changed since the '70s\").",
  },
] as const;

export function getCategoryMeta(key: QuickCategoryKey): QuickCategoryMeta {
  const m = QUICK_CATEGORIES.find((c) => c.key === key);
  if (!m) throw new Error(`unknown QuickCategoryKey: ${key}`);
  return m;
}
