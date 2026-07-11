import { create } from "zustand";
import { C } from "@/constants/theme";
import {
  MOODS,
  MOOD_TUNING as T,
  type MoodLabel,
  type MoodReading,
} from "@/constants/moods";
import { useSettings } from "@/stores/settingsStore";
import { useTimeline } from "@/stores/timelineStore";

/**
 * Moment Mood state. Ephemeral — reset on session start/end, never persisted.
 *
 * Two producers feed this: a cheap deterministic sensor heuristic (every poller
 * tick, so the mood moves even when Tim isn't sending messages) and Gemini's
 * read on the emote call. The sensor is the FLOOR; the LLM is the AUTHORITY.
 * Both go through observe(), weighted by confidence.
 */
interface MoodState {
  label: MoodLabel;
  valence: number;
  energy: number;
  confidence: number;
  sources: string[];
  lastObservedAt: number | null;
  lastFlipAt: number;
  /** Challenger label waiting out the flip streak. */
  pendingLabel: MoodLabel | null;
  pendingStreak: number;
  /** Recent readings, newest last. Drives the badge's breakdown sheet. */
  history: MoodReading[];

  observe: (r: MoodReading) => void;
  /** Decay toward neutral when nothing has been observed for a while. */
  tick: () => void;
  reset: () => void;
  /** Manual override from the mood sheet. */
  forceNeutral: () => void;
}

const INITIAL = {
  label: "neutral" as MoodLabel,
  valence: 0,
  energy: MOODS.neutral.energy,
  confidence: 0,
  sources: [] as string[],
  lastObservedAt: null as number | null,
  lastFlipAt: 0,
  pendingLabel: null as MoodLabel | null,
  pendingStreak: 0,
  history: [] as MoodReading[],
};

export const useMood = create<MoodState>((set, get) => ({
  ...INITIAL,

  observe: (r) => {
    if (!useSettings.getState().moodEnabled) return;
    if (r.confidence < T.MIN_CONFIDENCE) return;

    const s = get();
    const now = Date.now();

    // Continuous: confidence-weighted EMA. A full-confidence Gemini read moves
    // the needle 35%; a 0.3-confidence sensor seed moves it ~10%.
    const alpha = T.EMA_ALPHA_BASE * r.confidence;
    const valence = s.valence + alpha * (r.valence - s.valence);
    const energy = s.energy + alpha * (r.energy - s.energy);

    const history = [...s.history, r].slice(-T.HISTORY_CAP);

    // Discrete: the label only changes on a streak, a dwell timeout, or a snap.
    let { label, pendingLabel, pendingStreak, lastFlipAt } = s;

    if (r.label === s.label) {
      pendingLabel = null;
      pendingStreak = 0;
    } else {
      pendingStreak = r.label === pendingLabel ? pendingStreak + 1 : 1;
      pendingLabel = r.label;

      const dist = Math.hypot(r.valence - valence, r.energy - energy);
      const snap = r.confidence >= T.SNAP_CONFIDENCE && dist >= T.SNAP_DISTANCE;
      const earned =
        pendingStreak >= T.LABEL_FLIP_STREAK &&
        now - lastFlipAt >= T.MIN_LABEL_DWELL_MS;

      if (snap || earned) {
        const from = label;
        label = r.label;
        lastFlipAt = now;
        pendingLabel = null;
        pendingStreak = 0;

        useTimeline.getState().append({
          kind: "mood-shift",
          icon: MOODS[label].emoji,
          label: `Mood · ${from} → ${label}`,
          detail: r.sources.join(" · "),
          meta: {
            from,
            to: label,
            origin: r.origin,
            confidence: Number(r.confidence.toFixed(2)),
            sources: r.sources,
            snap,
          },
        });
      }
    }

    set({
      label,
      valence,
      energy,
      confidence: r.confidence,
      sources: r.sources,
      lastObservedAt: now,
      lastFlipAt,
      pendingLabel,
      pendingStreak,
      history,
    });
  },

  tick: () => {
    const s = get();
    if (!s.lastObservedAt) return;
    const idle = Date.now() - s.lastObservedAt;
    if (idle < T.DECAY_AFTER_MS) return;

    // Drift back toward the neutral anchor. Prevents "stuck ominous from an
    // hour ago" outliving the storm that caused it.
    const span = T.DECAY_FULL_MS - T.DECAY_AFTER_MS;
    const t = Math.min(1, (idle - T.DECAY_AFTER_MS) / span) * 0.25;
    const valence = s.valence + (0 - s.valence) * t;
    const energy = s.energy + (MOODS.neutral.energy - s.energy) * t;

    const settled = Math.abs(valence) < 0.15 && energy < 0.4;
    if (settled && s.label !== "neutral") {
      useTimeline.getState().append({
        kind: "mood-shift",
        icon: MOODS.neutral.emoji,
        label: `Mood · ${s.label} → neutral`,
        detail: "decayed — nothing new observed",
        meta: { from: s.label, to: "neutral", origin: "decay" },
      });
      set({
        label: "neutral",
        valence,
        energy,
        confidence: 0,
        sources: [],
        lastFlipAt: Date.now(),
        pendingLabel: null,
        pendingStreak: 0,
      });
      return;
    }
    set({ valence, energy });
  },

  reset: () => set({ ...INITIAL }),

  forceNeutral: () =>
    set({
      label: "neutral",
      valence: 0,
      energy: MOODS.neutral.energy,
      confidence: 0,
      sources: [],
      lastFlipAt: Date.now(),
      pendingLabel: null,
      pendingStreak: 0,
    }),
}));

// ── Narrow selectors ──────────────────────────────────────────────
// The border re-renders on label/energy only; `sources` churn must not touch it.

export const useMoodLabel = () => useMood((s) => s.label);
export const useMoodEnergy = () => useMood((s) => s.energy);

// ── Non-hook accessors, for services ──────────────────────────────

export function currentMoodLabel(): MoodLabel {
  return useMood.getState().label;
}

/**
 * The mood, for consumers that should ignore a weak read (emote tint, audio
 * tags). Undefined when mood is off or we aren't confident enough to color
 * anything — callers then degrade to their pre-mood behavior.
 */
export function moodForApply():
  | { label: MoodLabel; energy: number; valence: number }
  | undefined {
  const s = useMood.getState();
  if (!useSettings.getState().moodEnabled) return undefined;
  if (s.confidence < T.APPLY_CONFIDENCE) return undefined;
  if (s.label === "neutral") return undefined;
  return { label: s.label, energy: s.energy, valence: s.valence };
}

/**
 * Emote text color. Pass the mood the message was STAMPED with — not the live
 * mood — or an hour-old bright message repaints red the moment a storm rolls
 * in. Undefined stamp (legacy messages) falls back to the house emote violet.
 */
export function useEmoteColor(stamped?: MoodLabel): string {
  const enabled = useSettings((s) => s.moodEnabled);
  const tint = useSettings((s) => s.moodTintsEmotes);
  if (!enabled || !tint) return C.emote;
  if (!stamped || stamped === "neutral") return C.emote;
  return MOODS[stamped].emoteTint;
}
