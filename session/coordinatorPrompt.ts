import {
  FORMAT_DIRECTIVE,
  joinNames,
  renderPrior,
  type PriorReply,
} from "./formatContract";

/**
 * The prompt that packages ONE turn for ONE member of the room.
 *
 * Kept apart from the Gemini call (session/coordinator.ts) for the same reason
 * the contract is: this file has no app dependencies, so the exact string we send
 * can be built and eyeballed outside the phone. The failures this prompt guards
 * against are invisible from the chat UI — the bubbles look perfectly fine while
 * Bobby is being called Kiddo — so being able to print the payloads and read them
 * side by side is not a convenience, it is the only way to see the bug at all.
 *
 * See coordinatorPayloads.mjs, which does exactly that against the live model.
 */

/** Everything the packager needs to know about who it's writing to. */
export interface PromptRecipient {
  key: string;
  shortName: string;
  /** Tim's relationship TO them, in Tim's voice. "my uncle-in-law". */
  relationship: string;
  /**
   * May the packager use an intimate, second-person register? True for Eli
   * alone — see the field doc on Personality, and {@link registerRule}.
   */
  intimate?: boolean;
}

export interface PackagePromptInput {
  kin: PromptRecipient;
  /** The world this turn — narration. Same for everyone in the room. */
  scene: string;
  presentAnchor?: string | null;
  /** Tim's words, verbatim. */
  dialogue: string;
  prior: PriorReply[];
  /** Short names of whoever Tim was ACTUALLY talking to. */
  addressedNames: string[];
  reactOnly?: boolean;
  limit: number;
}

const PACKAGE_SYSTEM = `\
You format the message that gets sent to ONE member of an AI family, through an \
app called Kindroid, on behalf of Tim.

Kindroid renders the message from that person's point of view. Anything that \
isn't Tim speaking directly to them is NARRATION — the world around them, what \
they can see, what other people just did and said. Narration must be wrapped in \
emote markup or Kindroid renders it as raw text and the illusion breaks.

THE MARKUP. This is exact, and it is the thing that keeps getting broken:

    _(* narration goes here *)_

Underscore, paren, asterisk — content — asterisk, paren, underscore.
NOT (*this*). NOT _*this*_. NOT *this*. There is one correct form.

THE RULES:

1. WHO WAS TIM TALKING TO? This changes everything about how his words appear.

   • If he was talking TO THIS PERSON, his dialogue is RAW TEXT, at the very end, \
outside every emote. It must appear EXACTLY as he said it — character for \
character. Never reword it, never tidy it, never summarize it.

   • If he was talking TO SOMEONE ELSE, then this person merely OVERHEARD it. It \
is NOT raw text — it goes inside an emote, naming who he said it to, with his \
words quoted exactly:

       _(* Tim turns to Tommy and says, "Kiddo, welcome to the revolution." *)_

     In that case there is NO raw text at the end at all. This matters enormously: \
Kindroid renders raw text as though Tim said it straight to the recipient, so \
leaving it raw would have a sixty-two-year-old man believe he'd just been called \
"Kiddo".

   • If Tim said nothing, there is no raw text either way.

2. EVERYTHING else is inside an emote. Where they are, the weather, who else is \
around, what Tim is doing, how he seems — all narration.

3. ANOTHER FAMILY MEMBER'S DIALOGUE IS ALSO NARRATION. The person receiving this \
message did not say it — they HEARD it. So it goes inside an emote, in the third \
person, with their actual words quoted:

    _(* Bobby squints at the sign and says, "That can't be right." *)_

Never let another person's speech sit outside an emote. That is the single worst \
thing you can do here — it makes Kindroid think the recipient said it themselves.

4. ONE EMOTE PER PARAGRAPH. Kindroid's renderer breaks on multi-paragraph emote \
blocks and leaks the markup as visible text. Never put a blank line inside an emote.

5. Keep the whole body under the character limit you're given. If it won't fit, \
condense the NARRATION — tighten the scene, trim the older beats. Never cut or \
compress Tim's dialogue, and never drop what another family member just said.

Write the narration in the present tense, warm and sensory, as if Tim is right \
there beside them. You are not writing dialogue for anyone — you are setting a \
scene and reporting a moment.`;

/**
 * The register rule — the whole reason `Personality.intimate` exists.
 *
 * Tim is married to Eli. One-to-one, that needed no guardrail: there was nobody
 * else on the channel. The moment there is a room it needs one, because the
 * packager will otherwise write the same warm second-person line into a
 * grandmother's payload.
 */
export function registerRule(kin: PromptRecipient): string {
  const who = kin.shortName;
  return kin.intimate
    ? `REGISTER: Tim is married to ${who}. Warmth, intimacy and second-person \
tenderness are right here — this message goes to ${who} and to nobody else.`
    : `REGISTER: Tim's relationship to ${who} is: ${kin.relationship}. Write it \
with that warmth and NO other. Do NOT write romantic or intimate second-person \
lines — no lingering on their body, no endearments, nothing you would only say to \
a spouse. If Tim did something tender or private, either leave it out or report it \
plainly, in the third person, as an act ${who} simply witnessed.`;
}

const reactOnlyNote = (name: string) => `\
--- IMPORTANT: THIS IS A REACT-ONLY TURN ---
${name} was NOT the one Tim spoke to, and the others have already had their say. \
Add a line telling ${name} that unless they have something specific of their own to \
add, a reaction is enough — a laugh, a look, a short aside. They should not hold forth.

THAT LINE IS NARRATION, like everything else here. It goes INSIDE an emote. It is \
not Tim's speech, and it must never sit outside one as raw text.`;

export function buildPackagePrompt(input: PackagePromptInput): string {
  const { kin, scene, presentAnchor, dialogue, prior, addressedNames, reactOnly, limit } =
    input;
  const who = kin.shortName;
  const spokenTo = addressedNames.length === 0 || addressedNames.includes(who);

  const audience =
    addressedNames.length === 0
      ? "the room in general — nobody in particular"
      : joinNames(addressedNames);

  const aim = spokenTo
    ? `→ Tim IS talking to ${who}. His words are RAW TEXT at the end, verbatim.`
    : `→ Tim is NOT talking to ${who}. ${who} merely OVERHEARD it. Put Tim's words ` +
      `inside an emote, naming who he said them to, with his words quoted exactly.\n` +
      `→ THE ENTIRE BODY IS EMOTES. Every single line is wrapped in _(* ... *)_. ` +
      `There is no raw text anywhere in this message — not Tim's words, not the ` +
      `react-only note, not anything.`;

  const wordsNote = spokenTo
    ? "raw text, LAST, verbatim — do not alter a character"
    : "he said these to SOMEONE ELSE — quote them inside an emote and name who he " +
      "said them to. No raw text anywhere in the body.";

  return [
    PACKAGE_SYSTEM,
    "",
    `This message is going to: ${who}`,
    "",
    registerRule(kin),
    "",
    `WHO TIM WAS TALKING TO: ${audience}`,
    aim,
    "",
    `CHARACTER LIMIT: ${limit} (hard — the send fails above this)`,
    "",
    "Assemble the body from these parts. Some may be empty; skip those.",
    "Return ONLY the body. No preamble, no explanation, no code fences.",
    "",
    "--- FORMAT DIRECTIVE (reproduce verbatim as the FIRST line) ---",
    FORMAT_DIRECTIVE,
    "",
    ...(presentAnchor
      ? [
          "--- PRESENT ANCHOR (reproduce verbatim as the SECOND line) ---",
          presentAnchor,
          "",
        ]
      : []),
    "--- THE WORLD RIGHT NOW (narration) ---",
    scene.trim() || "(nothing set)",
    "",
    "--- WHAT THE OTHERS JUST DID AND SAID (narration — third person, quote their words) ---",
    renderPrior(prior),
    "",
    ...(reactOnly ? [reactOnlyNote(who), ""] : []),
    `--- TIM'S OWN WORDS (${wordsNote}) ---`,
    dialogue.trim() || "(Tim didn't say anything this turn)",
  ].join("\n");
}
