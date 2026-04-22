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
    const snapshotText = opts.sceneMemo
      ? `[TIM-CAPTURED SCENE — use this for Tier 1 grounding; take precedence over sensor defaults]\n${opts.sceneMemo}\n\n${baseSnapshot}`
      : baseSnapshot;

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
