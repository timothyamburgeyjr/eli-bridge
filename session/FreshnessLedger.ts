import type { SensorSnapshot } from "@/types";
import { CONFIG } from "@/constants/config";

export interface LedgerSnapshot {
  location?: string;
  weather?: string;
  companions?: string[];
  nowPlaying?: string;
  activity?: string;
  heartRate?: number;
  elevation?: number;
  uvIndex?: number;
  calendarNext?: string;
  /** Unix ms of when each field was last sent */
  sentAt: Record<string, number>;
}

export class FreshnessLedger {
  private last: LedgerSnapshot = { sentAt: {} };

  /** Current ledger (read-only). */
  get snapshot(): Readonly<LedgerSnapshot> {
    return this.last;
  }

  /** Reset the ledger at session start. */
  reset(): void {
    this.last = { sentAt: {} };
  }

  /**
   * Given a fresh sensor snapshot, return only the fields that changed
   * (or aged past their resend interval). Unchanged fields are suppressed
   * so Gemini doesn't repeat them in the emote.
   */
  filter(current: SensorSnapshot): SensorSnapshot {
    const now = Date.now();
    const out: SensorSnapshot = {};

    if (current.location) {
      const key = locationKey(current.location);
      if (key && key !== this.last.location) out.location = current.location;
    }

    if (current.weather) {
      const key = `${Math.round(current.weather.temp)}·${current.weather.conditions}`;
      const lastWeatherMs = this.last.sentAt.weather ?? 0;
      const stale = now - lastWeatherMs > CONFIG.WEATHER_RESEND_INTERVAL_MIN * 60_000;
      if (key !== this.last.weather || stale) out.weather = current.weather;
    }

    if (current.activity && current.activity !== this.last.activity) {
      out.activity = current.activity;
    }

    if (current.nowPlaying) {
      const key = `${current.nowPlaying.track}·${current.nowPlaying.artist}`;
      if (key !== this.last.nowPlaying) out.nowPlaying = current.nowPlaying;
    }

    if (current.companions && !sameCompanions(current.companions, this.last.companions)) {
      out.companions = current.companions;
    }

    if (current.health?.heartRate !== undefined) {
      // Only surface anomalous HR — per system prompt, normal is suppressed
      if (isAnomalousHr(current.health.heartRate, current.activity)) {
        out.health = { heartRate: current.health.heartRate };
      }
    }

    if (
      current.barometer?.delta30min !== undefined &&
      Math.abs(current.barometer.delta30min) > 2
    ) {
      out.barometer = current.barometer;
    }

    if (current.calendar?.nextEvent && current.calendar.nextEvent !== this.last.calendarNext) {
      out.calendar = current.calendar;
    }

    // Always surface speaker/face labels and ambient audio — they're per-message
    if (current.speakerLabels) out.speakerLabels = current.speakerLabels;
    if (current.faceLabels) out.faceLabels = current.faceLabels;
    if (current.ambientAudio) out.ambientAudio = current.ambientAudio;

    return out;
  }

  /**
   * Commit the current snapshot to the ledger — call after a successful send.
   */
  commit(current: SensorSnapshot): void {
    const now = Date.now();
    if (current.location) {
      this.last.location = locationKey(current.location);
      this.last.sentAt.location = now;
    }
    if (current.weather) {
      this.last.weather = `${Math.round(current.weather.temp)}·${current.weather.conditions}`;
      this.last.sentAt.weather = now;
    }
    if (current.activity) {
      this.last.activity = current.activity;
      this.last.sentAt.activity = now;
    }
    if (current.nowPlaying) {
      this.last.nowPlaying = `${current.nowPlaying.track}·${current.nowPlaying.artist}`;
      this.last.sentAt.nowPlaying = now;
    }
    if (current.companions) {
      this.last.companions = [...current.companions];
      this.last.sentAt.companions = now;
    }
    if (current.calendar?.nextEvent) {
      this.last.calendarNext = current.calendar.nextEvent;
      this.last.sentAt.calendar = now;
    }
  }
}

function locationKey(loc: NonNullable<SensorSnapshot["location"]>): string {
  return loc.placeName ?? `${loc.latitude.toFixed(4)},${loc.longitude.toFixed(4)}`;
}

function sameCompanions(a?: string[], b?: string[]): boolean {
  if (!a || !b) return a === b;
  if (a.length !== b.length) return false;
  const as = [...a].sort();
  const bs = [...b].sort();
  return as.every((v, i) => v === bs[i]);
}

function isAnomalousHr(hr: number, activity?: string): boolean {
  if (activity === "walking" || activity === "running") return hr > 150;
  if (activity === "car" || activity === "still" || !activity) return hr > 110 || hr < 45;
  return hr > 160 || hr < 40;
}
