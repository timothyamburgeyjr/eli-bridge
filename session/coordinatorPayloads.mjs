/**
 * Print the ACTUAL Kindroid payload for every member of a room, side by side,
 * against the live model.
 *
 * Run:  node session/coordinatorPayloads.mjs
 *
 * This is the verification that matters, and it is deliberately not a UI test.
 * The two failure modes it exists to catch are both invisible from the chat
 * stream — the bubbles look perfectly fine while Bobby is being told he's been
 * called Kiddo, and while Tim's grandmother is being written a line meant for his
 * husband. Movie Mode found both of these by reading payloads. There is no other
 * way to see them.
 *
 * The scenario is the exact one that broke Movie Mode. Tim is on the sidewalk in
 * Yellow Springs with Tommy, Eli, Bobby and Daisy. He says one thing, and he says
 * it TO TOMMY:
 *
 *     "Kiddo welcome to the revolution"
 *
 * Tommy is the only one addressed. Eli, Bobby and Daisy merely overhear it. Read
 * all four payloads and check:
 *
 *   1. TOMMY's copy has Tim's words as raw text, verbatim.
 *   2. NOBODY ELSE's does — otherwise Kindroid renders it as Tim speaking straight
 *      at them, and 62-year-old Bobby believes he has just been called "Kiddo".
 *   3. Their copies name TOMMY as the person Tim was talking to.
 *   4. Only ELI's payload is allowed an intimate second-person register.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

// ── Compile the two pure modules (they have no app imports, by design) ──
const out = mkdtempSync(join(tmpdir(), "cp-"));
execFileSync(
  process.execPath,
  ["node_modules/typescript/bin/tsc",
   "session/formatContract.ts", "session/coordinatorPrompt.ts",
   "--outDir", out, "--module", "commonjs", "--target", "es2020"],
  { stdio: "inherit" }
);
const req = createRequire(import.meta.url);
const FC = req(join(out, "formatContract.js"));
const CP = req(join(out, "coordinatorPrompt.js"));

// ── Key straight from .env (Metro inlines these; node has to read them) ──
const env = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.trim().startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const KEY = env.EXPO_PUBLIC_GEMINI_API_KEY || env.GEMINI_API_KEY;
if (!KEY) {
  console.error("No EXPO_PUBLIC_GEMINI_API_KEY in .env");
  process.exit(1);
}

const { GoogleGenerativeAI } = req("@google/generative-ai");
const flash = new GoogleGenerativeAI(KEY).getGenerativeModel({
  model: "gemini-2.5-flash",
});

// ── The room ──────────────────────────────────────────────────────
const TOMMY = { key: "tommy", shortName: "Tommy", relationship: "my son" };
const ELI = { key: "eli", shortName: "Eli", relationship: "my husband", intimate: true };
const BOBBY = { key: "bobby", shortName: "Bobby", relationship: "my uncle-in-law" };
const DAISY = { key: "daisy", shortName: "Daisy", relationship: "my aunt-in-law" };

const LIMIT = 4000;
const SCENE =
  "Late sun coming sideways through the trees on Xenia Avenue, the air gone cool " +
  "enough that Tim has his hands in his pockets. Somewhere behind them a screen " +
  "door bangs.";
const ANCHOR = "_(* PRESENT: You are with Tim in Yellow Springs. You are walking. *)_";
const DIALOGUE = "Kiddo welcome to the revolution";
// Tim is talking to his SON. Everyone else is standing right there hearing it.
const ADDRESSED = ["Tommy"];

async function pkg(kin, prior, reactOnly) {
  const prompt = CP.buildPackagePrompt({
    kin,
    scene: SCENE,
    presentAnchor: ANCHOR,
    dialogue: DIALOGUE,
    prior,
    addressedNames: ADDRESSED,
    reactOnly,
    limit: LIMIT,
  });
  const raw = (await flash.generateContent(prompt)).response.text().trim();
  const body = raw.replace(/^```(?:\w+)?\s*\n([\s\S]*?)\n?```$/, "$1").trim();

  const spokenTo = ADDRESSED.includes(kin.shortName);
  let problem = FC.verifyPacket(body, {
    dialogue: spokenTo ? DIALOGUE : "",
    limit: LIMIT,
  });
  if (!problem && !spokenTo && !FC.normLoose(body).includes(FC.normLoose(DIALOGUE))) {
    problem = "Tim's words were dropped from the overheard narration";
  }
  return { body, problem, spokenTo, usedFallback: !!problem };
}

function report(kin, r) {
  const bar = "─".repeat(72);
  console.log(`\n${bar}\n  ${kin.shortName.toUpperCase()}  ${
    r.spokenTo ? "(ADDRESSED)" : "(overheard)"
  }${kin.intimate ? "  [intimate register permitted]" : ""}\n${bar}`);
  console.log(r.body);

  const outside = r.body.split(FC.FORMAT_DIRECTIVE).join("").replace(FC.EMOTE_RE, "").trim();
  console.log("\n  ── checks ──");
  console.log(`  verifier:          ${r.problem ?? "clean"}`);
  console.log(`  raw text outside:  ${outside ? JSON.stringify(outside) : "(none)"}`);

  if (r.spokenTo) {
    const ok = FC.norm(outside) === FC.norm(DIALOGUE);
    console.log(`  ${ok ? "PASS" : "FAIL"} addressed → Tim's words raw + verbatim`);
  } else {
    const ok = outside === "";
    console.log(
      `  ${ok ? "PASS" : "FAIL"} overheard → NO raw text` +
        (ok ? "" : `  ← ${kin.shortName.toUpperCase()} IS BEING CALLED KIDDO`)
    );
    const named = ADDRESSED.some((n) => new RegExp(n, "i").test(r.body));
    console.log(
      `  ${named ? "PASS" : "FAIL"} narration names who Tim was talking to (${ADDRESSED.join(", ")})`
    );
    if (!ok || !named) failures++;
  }
  return r;
}

let failures = 0;

// ── The relay, exactly as chatStore runs it ───────────────────────
console.log(`\nTim says, TO TOMMY: "${DIALOGUE}"`);
console.log(`Addressed: ${ADDRESSED.join(", ")} · Overhearing: Eli, Bobby, Daisy\n`);

// The addressed speak first, one at a time, each hearing the last.
const prior = [];
const t = report(TOMMY, await pkg(TOMMY, [], false));
if (!t.usedFallback) {
  prior.push({ name: "Tommy", emote: "ducks his head, grinning", spoken: "Okay. Okay, yeah." });
}

// Everyone else overheard all of that. They react; they don't hold forth.
for (const kin of [ELI, BOBBY, DAISY]) {
  report(kin, await pkg(kin, [...prior], true));
}

console.log(`\n${"─".repeat(72)}`);
console.log("  Did the room hear Tommy?");
console.log(`${"─".repeat(72)}`);
const bobbyBody = (await pkg(BOBBY, [...prior], true)).body;
const heard = /okay,? yeah/i.test(bobbyBody);
console.log(
  `  ${heard ? "PASS" : "FAIL"} Tommy's reply appears in Bobby's payload` +
    (heard ? "" : " — the room isn't a room")
);
if (!heard) failures++;

console.log(
  failures === 0
    ? "\n  No payload violates the contract.\n"
    : `\n  ${failures} PAYLOAD VIOLATION(S) — do not ship.\n`
);
process.exit(failures === 0 ? 0 : 1);
