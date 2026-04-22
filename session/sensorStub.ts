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

/**
 * Compile a sensor snapshot into the text block passed to Gemini as "[SENSOR SNAPSHOT]".
 * Gemini uses this to build the Tier 1/2 emote scene.
 */
export function snapshotToText(s: SensorSnapshot): string {
  const parts: string[] = [];

  if (s.location) {
    const where = s.location.placeName ?? `${s.location.latitude}, ${s.location.longitude}`;
    const typeBit = s.location.placeType ? ` (${s.location.placeType})` : "";
    parts.push(`Location: ${where}${typeBit}`);
  }
  if (s.weather) {
    const bits = [`${Math.round(s.weather.temp)}°F`, s.weather.conditions];
    if (s.weather.humidity !== undefined) bits.push(`humidity ${s.weather.humidity}%`);
    if (s.weather.windSpeed !== undefined) bits.push(`wind ${s.weather.windSpeed} mph`);
    if (s.weather.uvIndex !== undefined) bits.push(`UV ${s.weather.uvIndex}`);
    if (s.weather.alerts?.length) bits.push(`alerts: ${s.weather.alerts.join("; ")}`);
    parts.push(`Weather: ${bits.join(", ")}`);
  }
  if (s.activity) parts.push(`Activity: ${s.activity}`);
  if (s.health?.heartRate !== undefined) parts.push(`Heart rate: ${s.health.heartRate} bpm`);
  if (s.barometer?.delta30min !== undefined) {
    parts.push(`Barometer: ${s.barometer.pressure} hPa (Δ30min ${s.barometer.delta30min})`);
  }
  if (s.companions?.length) parts.push(`Companions: ${s.companions.join(", ")}`);
  if (s.nowPlaying) parts.push(`Now playing: ${s.nowPlaying.track} — ${s.nowPlaying.artist}`);
  if (s.calendar?.nextEvent) {
    parts.push(`Next event: ${s.calendar.nextEvent}${s.calendar.timeUntil ? ` (${s.calendar.timeUntil})` : ""}`);
  }
  if (s.speakerLabels?.length) {
    parts.push(
      `Speakers identified: ${s.speakerLabels
        .map((l) => `${l.speaker}: "${l.quote}" (conf ${l.confidence.toFixed(2)})`)
        .join(" | ")}`
    );
  }
  if (s.faceLabels?.length) {
    parts.push(
      `Faces identified: ${s.faceLabels.map((f) => `${f.person} (${f.confidence.toFixed(2)})`).join(", ")}`
    );
  }
  if (s.ambientAudio) parts.push(`Ambient audio: ${s.ambientAudio}`);

  return parts.length ? parts.join("\n") : "(no sensor data available)";
}
