import type { Personality } from "@/constants/personalities";
import { CONFIG } from "@/constants/config";
import { neutralGenerate } from "@/services/gemini";
import { buildPackagePrompt } from "@/session/coordinatorPrompt";
import {
  mechanicalPayload,
  normLoose,
  verifyPacket,
  type PriorReply,
} from "@/session/formatContract";

export { renderPrior, replyToPrior, verifyPacket } from "@/session/formatContract";
export type { PriorReply } from "@/session/formatContract";

/**
 * The coordinator — it runs the room.
 *
 * Every member of the room gets their OWN Kindroid message. That is not an
 * implementation detail, it is the whole architecture: each companion's payload
 * is a private channel, so anything you put in one is heard by them and by nobody
 * else. Two rules fall out of that, and neither is optional.
 *
 * ─── 1. ADDRESSED vs OVERHEARD ───
 *
 * Kindroid renders raw text as Tim speaking STRAIGHT AT the recipient. So:
 *
 *   • whoever Tim addressed  → his words as RAW TEXT, verbatim, at the end
 *   • everyone else          → his words as NARRATION, naming who he said them to:
 *         _(* Tim turns to Tommy and says, "Kiddo, welcome to the revolution." *)_
 *
 * Without that split, a remark aimed at Tommy lands on 62-year-old Bobby as
 * though Tim had called HIM kiddo — and on Daisy, who wasn't even in the
 * conversation. The bubbles look completely fine while this is happening. You
 * cannot see this bug from the UI. You can only see it by reading the payloads.
 *
 * ─── 2. THE PUBLIC ACT / PRIVATE EXPERIENCE SPLIT ───
 *
 * Public (in everyone's payload) is the ACT, and it always names its subject:
 *     _(* Tim holds out the bag and Bobby reads the label first. *)_
 * Private (in one payload alone) is the EXPERIENCE, and second person is safe
 * there precisely because the audience is one.
 *
 * Second-person intimacy broadcast to a room is a landmine. "I love you like
 * this, loose-limbed and soft-eyed" is right for Eli and is, to Lilly, a line
 * addressed to Tim's grandmother. `Personality.intimate` gates it, and it is true
 * for Eli alone.
 *
 * ─── WE DO NOT TRUST THE MODEL TO HONOUR THIS ───
 *
 * Every packet is verified in code before it goes out, and one that fails is
 * thrown away for the mechanical fallback — which honours the same rules, because
 * a fallback that doesn't is just the bug taking a different route. A model that
 * paraphrases Tim is worse than no model at all ("Tim's voice is law" is rule 6 of
 * this project), so that specific failure is checked, not hoped for.
 *
 * The three pieces are split so they can each be exercised without a phone:
 *   session/formatContract.ts    the contract + the checks   (zero imports)
 *   session/coordinatorPrompt.ts the exact prompt we send
 *   this file                    the model call, verify, fall back
 */

export interface PackageTurnInput {
  /** Who this payload is FOR. */
  kin: Personality;
  /**
   * The world, this turn — Gemini's rendering of the sensors into lived texture,
   * exactly as the solo path already builds it. The same for everyone in the
   * room; it does not scale with room size.
   */
  scene: string;
  /** The PRESENT anchor, already rendered for this kin. */
  presentAnchor?: string | null;
  /** Tim's words, verbatim. Never rewritten, never summarized, never tidied. */
  dialogue: string;
  /** Who has already spoken this turn, in the order they spoke. */
  prior: PriorReply[];
  /** Short names of whoever Tim was ACTUALLY talking to. */
  addressedNames: string[];
  /**
   * This companion was not spoken to, and the addressed have had their say — a
   * reaction is enough. They should not hold forth.
   */
  reactOnly?: boolean;
  signal?: AbortSignal;
}

/**
 * Build the Kindroid body for ONE member of the room.
 *
 * Never throws, and never returns something unusable: on a model failure or a
 * failed verification it falls back to the mechanical payload. A broken packet is
 * worse than an unpolished one, and an unsent message is worse than both.
 */
export async function packageTurn(input: PackageTurnInput): Promise<string> {
  const { kin, scene, presentAnchor, dialogue, prior, addressedNames, reactOnly } =
    input;
  const limit = CONFIG.KINDROID_TOTAL_CHAR_CAP;
  const spokenTo =
    addressedNames.length === 0 || addressedNames.includes(kin.shortName);

  const fallback = () =>
    mechanicalPayload({
      kin,
      scene,
      presentAnchor,
      dialogue,
      prior,
      addressedNames,
      limit,
    });

  let body: string;
  try {
    body = stripFences(
      await neutralGenerate(
        buildPackagePrompt({
          kin,
          scene,
          presentAnchor,
          dialogue,
          prior,
          addressedNames,
          reactOnly,
          limit,
        }),
        {
          // 20s. One short rewrite on Flash, sitting in the critical path of a
          // turn that already owes 30-90s to Kindroid. Past 20s, take the
          // mechanical payload and get the message moving.
          deadlineMs: 20_000,
          label: `packageTurn:${kin.key}`,
          signal: input.signal,
        }
      )
    );
  } catch (err) {
    console.warn(`[coordinator] packageTurn(${kin.key}) failed — mechanical`, err);
    return fallback();
  }

  // An overhearing companion must NOT have Tim's words as raw text, so the
  // "verbatim raw dialogue" check applies only to whoever he actually addressed.
  let problem = verifyPacket(body, { dialogue: spokenTo ? dialogue : "", limit });

  // Overheard: the model is QUOTING Tim, so it will add a comma or a full stop
  // inside the quotation marks. Check the WORDS survived, not the punctuation.
  if (
    problem === null &&
    dialogue.trim() &&
    !spokenTo &&
    !normLoose(body).includes(normLoose(dialogue))
  ) {
    problem = "Tim's words were dropped from the overheard narration";
  }

  if (problem) {
    console.warn(`[coordinator] packet for ${kin.key} rejected — ${problem}`);
    return fallback();
  }
  return body;
}

/** Flash occasionally wraps the body in ``` despite being told not to. */
function stripFences(s: string): string {
  const m = s.match(/^```(?:\w+)?\s*\n([\s\S]*?)\n?```$/);
  return (m ? m[1] : s).trim();
}
