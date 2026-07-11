import type { SensorSnapshot } from "@/types";
import { MOODS, type MoodLabel, type MoodReading } from "@/constants/moods";

/**
 * The cheap, deterministic half of Moment Mood: a provisional read built purely
 * from sensors. No network, no model, runs every poller tick.
 *
 * This is what lets the mood move when Tim ISN'T talking — night falls, the
 * weather turns, he walks up to a rollercoaster. Gemini then confirms or
 * overrides it on the next message.
 *
 * The confidence ceiling is deliberately low. A barometer can tell you it's
 * storming; it cannot tell you Tim is *delighted* by the storm. The sensor is
 * the FLOOR; the LLM is the AUTHORITY. The one exception is an active weather
 * alert, which is confident enough to snap the border red immediately.
 */

const CEILING = 0.6;
const ALERT_CONFIDENCE = 0.85;

interface Vote {
  label: MoodLabel;
  weight: number;
  source: string;
}

/** Place types that carry a mood strongly enough to vote on. */
const PLACE_MOOD: Record<string, MoodLabel> = {
  amusement_park: "charged",
  stadium: "charged",
  night_club: "charged",
  museum: "wonder",
  art_gallery: "wonder",
  aquarium: "wonder",
  zoo: "wonder",
  park: "serene",
  campground: "serene",
  library: "serene",
  church: "serene",
  cemetery: "melancholy",
  funeral_home: "melancholy",
  hospital: "melancholy",
};

const STORMY = /thunder|storm|squall|tornado/i;
const GLOOMY = /rain|drizzle|mist|fog|overcast/i;
const CLEAR = /clear|sun/i;

export function seedMood(
  s: SensorSnapshot,
  now: Date = new Date()
): MoodReading | null {
  const votes: Vote[] = [];
  let alerted = false;

  // ── Weather ──
  const w = s.weather;
  if (w) {
    if (w.alerts?.length) {
      // A tornado warning should turn the rim red NOW, not after a 45s dwell.
      votes.push({ label: "ominous", weight: 3, source: w.alerts[0] });
      alerted = true;
    } else if (STORMY.test(w.conditions)) {
      votes.push({ label: "ominous", weight: 1.6, source: w.conditions });
    } else if (GLOOMY.test(w.conditions)) {
      votes.push({ label: "melancholy", weight: 0.9, source: w.conditions });
    } else if (CLEAR.test(w.conditions) && w.temp >= 60 && w.temp <= 85) {
      votes.push({
        label: "bright",
        weight: 0.8,
        source: `${Math.round(w.temp)}°F and ${w.conditions.toLowerCase()}`,
      });
    }
  }

  // ── Barometer ── a fast pressure drop precedes weather the API hasn't
  // caught up with yet. This is the sensor doing something the network can't.
  const baro = s.barometer;
  if (baro && baro.delta30min <= -4) {
    votes.push({
      label: "ominous",
      weight: 1.4,
      source: `pressure dropping fast (${baro.delta30min.toFixed(1)} hPa/30min)`,
    });
  }

  // ── Place ──
  const placeType = s.location?.placeType;
  if (placeType && PLACE_MOOD[placeType]) {
    votes.push({
      label: PLACE_MOOD[placeType],
      weight: 1.1,
      source: s.location?.placeName ?? placeType.replace(/_/g, " "),
    });
  }

  // ── Time of day ──
  const h = now.getHours();
  if (h >= 22 || h < 5) {
    votes.push({ label: "serene", weight: 0.5, source: "late night" });
  } else if (h >= 5 && h < 8) {
    votes.push({ label: "serene", weight: 0.4, source: "early morning" });
  }

  // ── Body ── an elevated heart rate with no exertion to explain it is the
  // clearest physiological "something is happening" signal we get. Walking or
  // running would explain it away, so only count it when Tim is at rest.
  const hr = s.health?.heartRate;
  const atRest = s.activity === "still" || s.activity === "car";
  if (hr && hr > 105 && atRest) {
    votes.push({
      label: "charged",
      weight: 1.0,
      source: `heart rate ${Math.round(hr)} while ${
        s.activity === "still" ? "still" : "riding"
      }`,
    });
  }

  if (votes.length === 0) return null;

  // Winner by summed weight.
  const totals = new Map<MoodLabel, number>();
  for (const v of votes) {
    totals.set(v.label, (totals.get(v.label) ?? 0) + v.weight);
  }
  let label: MoodLabel = "neutral";
  let best = 0;
  for (const [l, t] of totals) {
    if (t > best) {
      best = t;
      label = l;
    }
  }

  const def = MOODS[label];
  const confidence = alerted
    ? ALERT_CONFIDENCE
    : Math.min(CEILING, 0.2 + best * 0.22);

  return {
    label,
    valence: def.valence,
    energy: def.energy,
    confidence,
    // Only the evidence that voted for the winner — a melancholy source under
    // an "ominous" read would be noise in the sheet.
    sources: votes
      .filter((v) => v.label === label)
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 3)
      .map((v) => v.source),
    origin: "sensor",
  };
}

/**
 * One-line summary of the seed, injected into the sensor snapshot text as a
 * PROVISIONAL read that Gemini may override. Making the hint explicit does two
 * things: it makes the model's read better (it's told what the barometer is
 * doing rather than having to infer it), and it makes overrides legible — if
 * Tim is laughing about the storm, Gemini returns `bright` and the sources say
 * why.
 */
export function seedToHint(r: MoodReading): string {
  return `Ambient mood read (provisional): ${r.label} — ${r.sources.join("; ")}`;
}
