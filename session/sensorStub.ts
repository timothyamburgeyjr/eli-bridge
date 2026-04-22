import type { SensorSnapshot } from "@/types";

/**
 * Hardcoded sensor snapshot used for dev-at-desk testing.
 * Assumes Tim is at his real home address while testing. Phase 7 replaces this
 * with live data from Location/Weather/NowPlaying/Sensors services. Phase 6
 * Scene Capture adds a manual scene-memo layer for rich zone context on top of
 * whatever sensors provide.
 */
export const STUB_SENSOR_SNAPSHOT: SensorSnapshot = {
  location: {
    latitude: 39.2428,
    longitude: -83.795,
    accuracy: 10,
    timestamp: Date.now(),
    placeName: "Home · 1550 Weisflock Rd, Lynchburg OH",
    placeType: "residential",
  },
  weather: {
    temp: 64,
    conditions: "clear",
    humidity: 48,
    windSpeed: 6,
    uvIndex: 3,
  },
  activity: "still",
  companions: [],
};

// ── Description helpers ──────────────────────────────────────────

function describeTimeOfDay(d: Date): string {
  const h = d.getHours();
  if (h < 6) return "pre-dawn, still dark outside";
  if (h < 9) return "early morning, first light";
  if (h < 12) return "mid-morning";
  if (h < 14) return "midday, sun overhead";
  if (h < 17) return "afternoon";
  if (h < 19) return "late afternoon, golden light";
  if (h < 21) return "early evening, light fading";
  return "night";
}

function describeLocationTexture(placeType?: string): string {
  if (!placeType) return "";
  if (placeType === "residential") return "his home";
  if (placeType === "restaurant" || placeType === "cafe" || placeType === "bar") return "indoor venue";
  if (placeType === "park" || placeType === "trail") return "outdoors";
  if (placeType === "museum" || placeType === "store" || placeType === "shop") return "indoor venue";
  if (placeType === "amusement_park" || placeType === "stadium" || placeType === "fairground") return "large outdoor venue";
  return placeType.replace(/_/g, " ");
}

function describeWeatherMood(
  conditions: string | undefined,
  isDaytime: boolean
): string {
  const c = (conditions ?? "").toLowerCase();
  if (c.includes("clear") && isDaytime) return "sun through the windows, bright";
  if (c.includes("clear")) return "clear night, sky open";
  if (c.includes("cloud")) return "overcast, soft diffuse light";
  if (c.includes("rain") || c.includes("drizzle")) return "rain audible against the window";
  if (c.includes("snow")) return "snow falling, muffled quiet outside";
  if (c.includes("storm") || c.includes("thunder")) return "storm rolling, air pressure shifting";
  if (c.includes("fog") || c.includes("mist")) return "fog softening the edges outside";
  return "";
}

function describeActivity(activity: string | undefined): string {
  if (!activity) return "";
  if (activity === "still") return "not moving — likely at his desk, on the couch, or settled somewhere";
  if (activity === "walking") return "on foot, walking pace";
  if (activity === "running") return "moving at a run";
  if (activity === "car" || activity === "IN_VEHICLE") return "in a vehicle";
  if (activity === "bicycle" || activity === "ON_BICYCLE") return "on a bike";
  if (activity === "train" || activity === "subway" || activity === "bus") return `aboard ${activity}`;
  return activity;
}

/**
 * Compile a sensor snapshot into a prose block Gemini uses to build the
 * Tier 1 ambient scene emote. Framed as evocative hints (not a bulleted data
 * dump) so Gemini weaves the context into a scene rather than reciting it.
 */
export function snapshotToText(s: SensorSnapshot): string {
  const now = new Date();
  const h = now.getHours();
  const isDaytime = h >= 7 && h < 20;

  const parts: string[] = [
    "[SCENE GROUND TRUTH — weave these into the Tier 1 emote as lived texture; don't list them as facts, don't quote clock times literally]",
    "",
  ];

  parts.push(`Time: ${describeTimeOfDay(now)}`);

  if (s.location) {
    const where = s.location.placeName ?? `${s.location.latitude.toFixed(4)}, ${s.location.longitude.toFixed(4)}`;
    const texture = describeLocationTexture(s.location.placeType);
    parts.push(`Location: ${where}${texture ? ` — ${texture}` : ""}`);
  }

  if (s.weather) {
    const w = s.weather;
    const mood = describeWeatherMood(w.conditions, isDaytime);
    const extras: string[] = [];
    if (w.humidity !== undefined) extras.push(`${w.humidity}% humidity`);
    if (w.windSpeed !== undefined && w.windSpeed > 0) extras.push(`wind ${w.windSpeed} mph`);
    if (w.uvIndex !== undefined && w.uvIndex > 7) extras.push(`UV ${w.uvIndex} (strong)`);
    const line = `Weather: ${Math.round(w.temp)}°F, ${w.conditions}${mood ? ` — ${mood}` : ""}${extras.length ? `; ${extras.join(", ")}` : ""}`;
    parts.push(line);
    if (w.alerts?.length) parts.push(`Weather alerts: ${w.alerts.join("; ")}`);
  }

  const activityNote = describeActivity(s.activity);
  if (activityNote) parts.push(`Tim: ${activityNote}`);

  if (s.companions && s.companions.length > 0) {
    parts.push(`With: ${s.companions.join(", ")}`);
  }

  if (s.health?.heartRate !== undefined) {
    parts.push(`Heart rate: ${s.health.heartRate} bpm`);
  }
  if (s.barometer?.delta30min !== undefined) {
    parts.push(`Barometer: ${s.barometer.pressure} hPa (Δ30min ${s.barometer.delta30min})`);
  }
  if (s.nowPlaying) {
    parts.push(`Playing: ${s.nowPlaying.track} — ${s.nowPlaying.artist}`);
  }
  if (s.calendar?.nextEvent) {
    parts.push(`Next event: ${s.calendar.nextEvent}${s.calendar.timeUntil ? ` (${s.calendar.timeUntil})` : ""}`);
  }
  if (s.speakerLabels?.length) {
    parts.push(
      `Speakers nearby: ${s.speakerLabels
        .map((l) => `${l.speaker} said "${l.quote}" (conf ${l.confidence.toFixed(2)})`)
        .join(" | ")}`
    );
  }
  if (s.faceLabels?.length) {
    parts.push(
      `Faces identified: ${s.faceLabels.map((f) => `${f.person} (${f.confidence.toFixed(2)})`).join(", ")}`
    );
  }
  if (s.ambientAudio) parts.push(`Ambient sound: ${s.ambientAudio}`);

  return parts.join("\n");
}
