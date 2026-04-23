import { Barometer } from "expo-sensors";

interface BaroSample {
  pressureHpa: number;
  ts: number;
}

let samples: BaroSample[] = [];
let subscription: { remove: () => void } | null = null;

/**
 * Start watching the barometer. Keeps a rolling 45-minute buffer so we can
 * compute Δ30min (storm detection signal per CLAUDE.md spec). Safe to call
 * multiple times — subsequent calls are no-ops.
 */
export function startBarometerWatch(): void {
  if (subscription) return;
  try {
    Barometer.setUpdateInterval(60_000); // one sample per minute
    subscription = Barometer.addListener(({ pressure }) => {
      samples.push({ pressureHpa: pressure, ts: Date.now() });
      // Trim to last 45 minutes
      const cutoff = Date.now() - 45 * 60 * 1000;
      samples = samples.filter((s) => s.ts >= cutoff);
    });
  } catch {
    // Barometer not available on device — silently ignore; emotes just won't have it
  }
}

export function stopBarometerWatch(): void {
  if (subscription) {
    subscription.remove();
    subscription = null;
  }
  samples = [];
}

/**
 * Read the most recent barometer reading plus its 30-minute delta. Returns
 * null if no samples have been collected yet (sensor not started, or device
 * doesn't have a barometer).
 */
export function readBarometer(): { pressure: number; delta30min: number } | null {
  if (samples.length === 0) return null;
  const latest = samples[samples.length - 1];
  const cutoff = Date.now() - 30 * 60 * 1000;
  const oldEnough = samples.find((s) => s.ts <= cutoff);
  const delta30min = oldEnough ? latest.pressureHpa - oldEnough.pressureHpa : 0;
  return { pressure: latest.pressureHpa, delta30min };
}

/** Quick check — is a barometer available on this device? */
export async function isBarometerAvailable(): Promise<boolean> {
  try {
    return await Barometer.isAvailableAsync();
  } catch {
    return false;
  }
}
