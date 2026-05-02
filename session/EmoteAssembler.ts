import type { Content } from "@google/generative-ai";
import type { SensorSnapshot } from "@/types";
import { assembleEmote, condenseEmote, ParsedMessage } from "@/services/gemini";
import { snapshotToText } from "./sensorStub";
import { FreshnessLedger } from "./FreshnessLedger";
import { CONFIG } from "@/constants/config";

export interface AssembleOptions {
  sensors: SensorSnapshot;
  timDialog: string;
  images?: { mimeType: string; data: string }[];
  audios?: { mimeType: string; data: string }[];
  history?: Content[];
  /**
   * One-shot scene memo from Scene Capture. Prepended to the sensor snapshot
   * for this call only, then caller is responsible for clearing.
   */
  sceneMemo?: string;
  /**
   * One-shot location-anchored briefing context — used by Save Place "Brief Eli
   * now" and the bundled-brief flow. Distinct from sceneMemo: scene comes from
   * Gemini-Pro photo analysis (rich texture), briefing is a structured place
   * list ("Tim is logging arrival at Dark Star Comics..."). Both can coexist.
   *
   * Includes a no-fabrication directive — Gemini should ground the emote in
   * the place name + sensor data, not invent interior details.
   */
  briefingContext?: string;
}

export interface AssembleResult extends ParsedMessage {
  /** Snapshot of sensors AFTER freshness filtering — useful for ledger commit / debug display. */
  filteredSensors: SensorSnapshot;
}

export class EmoteAssembler {
  constructor(private ledger: FreshnessLedger = new FreshnessLedger()) {}

  get freshness(): FreshnessLedger {
    return this.ledger;
  }

  async assemble(opts: AssembleOptions): Promise<AssembleResult> {
    const filtered = this.ledger.filter(opts.sensors);
    const baseSnapshot = snapshotToText(filtered);
    let snapshotText = baseSnapshot;
    if (opts.sceneMemo) {
      snapshotText = `[TIM-CAPTURED SCENE — use this for Tier 1 grounding; take precedence over sensor defaults]\n${opts.sceneMemo}\n\n${snapshotText}`;
    }
    if (opts.briefingContext) {
      // Briefing context is the "log this moment" trigger — the emote should
      // be a first-person Tim arrival/recap anchored on the named place(s).
      // Explicit no-fabrication directive so Flash doesn't invent details
      // beyond what the place name + sensor data + chat history justify.
      snapshotText =
        `[BRIEFING — Tim has tapped a "Brief Eli" action. Build a first-person ` +
        `arrival/recap emote anchored on the place(s) below. Do NOT fabricate ` +
        `interior details, smells, people, or ambience that aren't visible in ` +
        `attached photos or supported by sensor data — name + time + weather + ` +
        `activity is what's real, plus any context Eli already has from chat ` +
        `history. The emote can be sparse; that's correct for a quick waypoint.]\n` +
        `${opts.briefingContext}\n\n${snapshotText}`;
    }

    let parsed = await assembleEmote({
      sensorSnapshot: snapshotText,
      timDialog: opts.timDialog,
      images: opts.images,
      audios: opts.audios,
      history: opts.history,
    });

    // Character cap enforcement: trim over-budget emote via condensation
    if (parsed.leadingEmote.length > CONFIG.EMOTE_CHAR_CAP) {
      const trimmed = await condenseEmote(parsed.leadingEmote, CONFIG.EMOTE_CHAR_CAP);
      const capped = trimmed.length > CONFIG.EMOTE_CHAR_CAP
        ? trimmed.slice(0, CONFIG.EMOTE_CHAR_CAP).trim()
        : trimmed;
      parsed = {
        leadingEmote: capped,
        body: parsed.body,
        raw: `_(*${capped}*)_ ${parsed.body}`.trim(),
      };
    }

    // Commit ledger only on success so retries don't mark stale context as sent
    this.ledger.commit(opts.sensors);

    return { ...parsed, filteredSensors: filtered };
  }

  reset() {
    this.ledger.reset();
  }
}
