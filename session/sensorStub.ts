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

function describeTempFeel(tempF: number): string {
  if (tempF < 20) return "bitter cold";
  if (tempF < 35) return "cold, stiff air";
  if (tempF < 50) return "chilly";
  if (tempF < 62) return "cool";
  if (tempF < 72) return "mild, comfortable";
  if (tempF < 80) return "warm";
  if (tempF < 88) return "hot";
  return "blistering heat";
}

function describeWind(windMph: number): string {
  if (windMph < 3) return "air still";
  if (windMph < 10) return "light breeze";
  if (windMph < 20) return "steady wind";
  if (windMph < 30) return "strong wind";
  return "gale-force wind";
}

function describeHumidity(humidity: number, tempF: number): string {
  if (humidity > 80 && tempF > 72) return "heavy, sticky air";
  if (humidity > 70) return "muggy";
  if (humidity < 25) return "dry air";
  return "";
}

function isIndoorPlaceType(placeType?: string): boolean {
  if (!placeType) return false;
  return [
    "residential",
    "restaurant",
    "cafe",
    "bar",
    "store",
    "shop",
    "museum",
    "mall",
    "airport",
    "hospital",
    "office",
  ].includes(placeType);
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
    const isIndoors = isIndoorPlaceType(s.location?.placeType);
    const tempFeel = describeTempFeel(w.temp);

    const extras: string[] = [];
    if (w.humidity !== undefined) {
      const h = describeHumidity(w.humidity, w.temp);
      if (h) extras.push(h);
    }
    if (w.windSpeed !== undefined && w.windSpeed >= 10 && !isIndoors) {
      extras.push(describeWind(w.windSpeed));
    }
    // UV only matters when Tim is outdoors AND it's high. Indoors, UV is noise —
    // Eli doesn't need to know "the UV index is 7" when Tim is on the couch.
    if (w.uvIndex !== undefined && w.uvIndex > 7 && !isIndoors) {
      extras.push("sun feels harsh, bright enough to squint");
    }

    // Sensory line, no raw numbers. Gemini will weave felt texture; the Tier 1
    // prompt Bad example explicitly forbids "72°F and sunny" style data dumps.
    const line =
      `Weather: ${tempFeel}, ${w.conditions}${mood ? ` — ${mood}` : ""}` +
      `${extras.length ? `; ${extras.join(", ")}` : ""}`;
    parts.push(line);
    if (w.alerts?.length) parts.push(`Weather alerts: ${w.alerts.join("; ")}`);
  }

  const activityNote = describeActivity(s.activity);
  if (activityNote) parts.push(`Tim: ${activityNote}`);

  if (s.companions && s.companions.length > 0) {
    parts.push(`With: ${s.companions.join(", ")}`);
  }

  if (s.health?.heartRate !== undefined) {
    // Ledger already filters HR to anomalous-only. Translate to felt state.
    const hr = s.health.heartRate;
    const felt =
      hr >= 150
        ? "heart pounding hard"
        : hr >= 120
        ? "heart racing"
        : hr >= 100
        ? "heart elevated"
        : hr < 50
        ? "heart unusually slow"
        : "heart rate off-baseline";
    parts.push(`Physical: ${felt}`);
  }
  if (s.barometer?.delta30min !== undefined) {
    const d = s.barometer.delta30min;
    const felt =
      d <= -4
        ? "air pressure dropping fast — storm likely building"
        : d <= -2
        ? "pressure falling, weather shifting"
        : d >= 4
        ? "pressure rising sharply, air clearing"
        : "pressure shifting";
    parts.push(`Barometer: ${felt}`);
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
        .map((l) => {
          const who = l.notes ? `${l.speaker} (${l.notes})` : l.speaker;
          return `${who} said "${l.quote}" (conf ${l.confidence.toFixed(2)})`;
        })
        .join(" | ")}`
    );
  }
  if (s.faceLabels?.length) {
    parts.push(
      `Faces identified: ${s.faceLabels
        .map((f) => {
          const who = f.notes ? `${f.person} (${f.notes})` : f.person;
          return `${who} — conf ${f.confidence.toFixed(2)}`;
        })
        .join(" | ")}`
    );
  }
  if (s.ambientAudio) parts.push(`Ambient sound: ${s.ambientAudio}`);

  return parts.join("\n");
}
