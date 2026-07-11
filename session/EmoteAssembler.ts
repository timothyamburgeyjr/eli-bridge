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
  videos?: { mimeType: string; data: string }[];
  history?: Content[];
  /**
   * Current companion roster — passed through to Gemini so it can return
   * deltas relative to what's already understood to be present. Empty
   * list = just Tim and Eli. Caller (chatStore) reads from useCompanions
   * before invoking and applies the returned delta after.
   */
  currentCompanions?: string[];
  /**
   * Roster of known People (names only) so Gemini resolves "Henry" → "Hank"
   * instead of inventing new identities. Empty/undefined → no roster
   * guidance offered to the model.
   */
  rosterNames?: string[];
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
  /**
   * Web-lookup snippets Tim attached via 🔍 Look this up. Distinct from
   * briefingContext (Save Place arrival semantics) — lookup context is
   * encyclopedic background knowledge that Gemini should weave in WHEN
   * RELEVANT to Tim's message. Wrapped with its own directive so the
   * "no fabrication" rule from briefing doesn't suppress its use.
   */
  lookupContext?: string;
  /**
   * Abort signal — propagated into both the assembleEmote and condenseEmote
   * Gemini calls so a user-triggered abort short-circuits the deadline race
   * rather than waiting for it to expire.
   */
  signal?: AbortSignal;
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
        `[BRIEFING — Tim has tapped a "Brief" action. Build a first-person ` +
        `arrival/recap emote anchored on the place(s) below. Do NOT fabricate ` +
        `interior details, smells, people, or ambience that aren't visible in ` +
        `attached photos or supported by sensor data — name + time + weather + ` +
        `activity is what's real, plus any context the companion already has ` +
        `from chat history. The emote can be sparse; that's correct for a quick ` +
        `waypoint.]\n` +
        `${opts.briefingContext}\n\n${snapshotText}`;
    }
    if (opts.lookupContext) {
      // Lookup context is encyclopedic background Tim attached deliberately
      // via 🔍 Look this up. UNLIKE the briefing wrapper, this directive
      // INVITES use of the snippets — Tim wants Gemini to reference what's
      // in the lookup, not be cautious about it. The snippets are Tim's
      // chosen ground-truth for this beat.
      snapshotText =
        `[ATTACHED LOOKUPS — Tim explicitly attached these encyclopedic ` +
        `snippets for this message via the 🔍 Look this up flow. They are ` +
        `his chosen ground-truth — treat them as factual context Tim now ` +
        `knows. Weave the relevant facts into the emote naturally in his ` +
        `voice ("makes sense, apparently they're related to giraffes"); do ` +
        `NOT parrot verbatim and do NOT cite sources. If a snippet is ` +
        `irrelevant to what Tim said this turn, drop it — but if it fits, ` +
        `USE it.]\n${opts.lookupContext}\n\n${snapshotText}`;
    }

    let parsed = await assembleEmote({
      sensorSnapshot: snapshotText,
      timDialog: opts.timDialog,
      images: opts.images,
      audios: opts.audios,
      videos: opts.videos,
      history: opts.history,
      currentCompanions: opts.currentCompanions,
      rosterNames: opts.rosterNames,
      signal: opts.signal,
    });

    // Character cap enforcement: trim over-budget emote via condensation
    if (parsed.leadingEmote.length > CONFIG.EMOTE_CHAR_CAP) {
      const trimmed = await condenseEmote(parsed.leadingEmote, CONFIG.EMOTE_CHAR_CAP, opts.signal);
      const capped = trimmed.length > CONFIG.EMOTE_CHAR_CAP
        ? trimmed.slice(0, CONFIG.EMOTE_CHAR_CAP).trim()
        : trimmed;
      parsed = {
        leadingEmote: capped,
        body: parsed.body,
        raw: `_(*${capped}*)_ ${parsed.body}`.trim(),
        // Preserve the companion delta across condensation — condenseEmote
        // only trims the leading emote text; the delta inference is still
        // valid for this turn.
        companionDelta: parsed.companionDelta,
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
