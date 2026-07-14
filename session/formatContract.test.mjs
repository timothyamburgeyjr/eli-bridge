/**
 * The format contract, pinned.
 *
 * Run:  node session/formatContract.test.mjs
 *
 * These are the cases that broke Movie Mode in production, each one costing an
 * evening. They are cheap to run and they do not need a test framework — which is
 * the entire reason session/formatContract.ts imports nothing.
 *
 * The two that matter most:
 *   • the KIDDO case — a remark aimed at Tommy must never reach Bobby as raw text
 *   • the FALLBACK case — the mechanical payload must satisfy the same contract,
 *     or a rejected packet just reintroduces the bug through the back door
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// formatContract.ts imports nothing, so it transpiles and runs standalone —
// no bundler, no jest, no React Native. Invoke tsc's entrypoint directly rather
// than through npx: spawning a .cmd shim on Windows needs a shell and EINVALs
// without one.
const out = mkdtempSync(join(tmpdir(), "fc-"));
execFileSync(
  process.execPath,
  ["node_modules/typescript/bin/tsc", "session/formatContract.ts",
   "--outDir", out, "--module", "es2020", "--target", "es2020",
   "--moduleResolution", "bundler"],
  { stdio: "inherit" }
);
const C = await import(pathToFileURL(join(out, "formatContract.js")).href);

const LIMIT = 4000;
const ELI = { key: "eli", shortName: "Eli" };
const BOBBY = { key: "bobby", shortName: "Bobby" };
const TOMMY = { key: "tommy", shortName: "Tommy" };

let failed = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`  ok   ${name}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL ${name}\n         ${e.message}`);
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const D = C.FORMAT_DIRECTIVE;

console.log("\nverifyPacket");

check("accepts a clean addressed packet", () => {
  const body = `${D}\n_(* The rain has stopped. *)_ Look at that sky`;
  assert(
    C.verifyPacket(body, { dialogue: "Look at that sky", limit: LIMIT }) === null,
    "should be clean"
  );
});

check("the nested FORMAT_DIRECTIVE does not fail its own rule", () => {
  // The directive quotes the markup it describes, so the non-greedy emote regex
  // matches only to the INNER *)_ and leaves `notation *)_` behind. If it isn't
  // lifted out whole first, every single packet is rejected as stray markup.
  const body = `${D}\n_(* Quiet here. *)_ Hey`;
  const r = C.verifyPacket(body, { dialogue: "Hey", limit: LIMIT });
  assert(r === null, `directive rejected itself: ${r}`);
});

check("a curly apostrophe is not a rewrite", () => {
  // Tim types a straight quote; the model emits a curly one. Comparing raw
  // substrings rejected EVERY message with an apostrophe and silently disabled
  // the packaging layer for most of a night.
  const body = `${D}\n_(* Warm out. *)_ I don’t think that's right`;
  const r = C.verifyPacket(body, {
    dialogue: "I don't think that's right",
    limit: LIMIT,
  });
  assert(r === null, `curly apostrophe rejected: ${r}`);
});

check("catches a real paraphrase of Tim", () => {
  const body = `${D}\n_(* Warm out. *)_ I think that is incorrect`;
  const r = C.verifyPacket(body, {
    dialogue: "I don't think that's right",
    limit: LIMIT,
  });
  assert(r !== null, "paraphrase should be rejected");
});

check("catches the wrong emote dialect", () => {
  const body = `${D}\n*he shrugs* Hey`;
  const r = C.verifyPacket(body, { dialogue: "Hey", limit: LIMIT });
  assert(r !== null, "bare *stars* should be rejected");
});

check("catches another kin's speech left outside an emote", () => {
  const body = `${D}\n_(* Bobby leans in. *)_ That can't be right\nHey`;
  const r = C.verifyPacket(body, { dialogue: "Hey", limit: LIMIT });
  assert(r !== null, "unwrapped foreign speech should be rejected");
});

check("Tim's own *asterisk* emote survives the leftover check", () => {
  // He types "*shrugs* fine by me"; the Bridge converts it before it gets here.
  // The emote is stripped with all the others, so the leftover must be compared
  // against his SPOKEN words alone or this is rejected every time.
  const dialogue = "_(*shrugs*)_ fine by me";
  const body = `${D}\n_(* The bus is late. *)_ ${dialogue}`;
  const r = C.verifyPacket(body, { dialogue, limit: LIMIT });
  assert(r === null, `Tim's own emote broke the check: ${r}`);
});

check("rejects an empty body", () => {
  assert(C.verifyPacket("", { dialogue: "", limit: LIMIT }) !== null);
});

check("rejects an over-limit body", () => {
  const body = `${D}\n_(* ${"x".repeat(5000)} *)_`;
  assert(C.verifyPacket(body, { dialogue: "", limit: LIMIT }) !== null);
});

console.log("\nmechanicalPayload — the fallback must be SAFE, not just simple");

const scene = "Late sun through the trees, the air gone cool.";
const kiddo = "Kiddo welcome to the revolution";

check("ADDRESSED gets Tim's words raw and verbatim", () => {
  const body = C.mechanicalPayload({
    kin: TOMMY, scene, dialogue: kiddo, prior: [],
    addressedNames: ["Tommy"], limit: LIMIT,
  });
  const outside = body.split(D).join("").replace(C.EMOTE_RE, "").trim();
  assert(outside === kiddo, `Tommy should get it raw, got: ${JSON.stringify(outside)}`);
});

check("THE KIDDO BUG: an overhearer never gets Tim's words as raw text", () => {
  const body = C.mechanicalPayload({
    kin: BOBBY, scene, dialogue: kiddo, prior: [],
    addressedNames: ["Tommy"], limit: LIMIT,
  });
  const outside = body.split(D).join("").replace(C.EMOTE_RE, "").trim();
  assert(
    outside === "",
    `Bobby has raw text in his payload — he is being called Kiddo: ${JSON.stringify(outside)}`
  );
  assert(body.includes("Tommy"), "the narration must name who Tim said it to");
  assert(C.normLoose(body).includes(C.normLoose(kiddo)), "Tim's words must survive, quoted");
});

check("the fallback's own output passes the verifier (addressed)", () => {
  const body = C.mechanicalPayload({
    kin: TOMMY, scene, dialogue: kiddo, prior: [],
    addressedNames: ["Tommy"], limit: LIMIT,
  });
  const r = C.verifyPacket(body, { dialogue: kiddo, limit: LIMIT });
  assert(r === null, `fallback violates its own contract: ${r}`);
});

check("the fallback's own output passes the verifier (overheard)", () => {
  const body = C.mechanicalPayload({
    kin: BOBBY, scene, dialogue: kiddo,
    prior: [{ name: "Eli", emote: "glances over", spoken: "He's not wrong." }],
    addressedNames: ["Tommy"], limit: LIMIT,
  });
  const r = C.verifyPacket(body, { dialogue: "", limit: LIMIT });
  assert(r === null, `fallback violates its own contract: ${r}`);
});

check("a prior speaker's words land inside an emote, in the third person", () => {
  const body = C.mechanicalPayload({
    kin: BOBBY, scene, dialogue: "what do you two think", prior:
      [{ name: "Eli", emote: "tips his head back", spoken: "It's beautiful." }],
    addressedNames: ["Bobby"], limit: LIMIT,
  });
  assert(body.includes('Eli says, "It\'s beautiful."'), "Eli must be quoted in the third person");
  const outside = body.split(D).join("").replace(C.EMOTE_RE, "").trim();
  assert(
    !outside.includes("beautiful"),
    "Eli's speech leaked outside an emote — Bobby will think he said it himself"
  );
});

console.log("\nprior / segments");

check("replyToPrior splits a reply into emote and speech", () => {
  const p = C.replyToPrior("Eli", "_(* he squints *)_ That can't be right.");
  assert(p.emote === "he squints", `emote: ${p.emote}`);
  assert(p.spoken === "That can't be right.", `spoken: ${p.spoken}`);
});

check("renderPrior says so when nobody has spoken", () => {
  assert(C.renderPrior([]).includes("nobody"));
});

console.log(
  failed === 0
    ? "\nAll contract cases pass.\n"
    : `\n${failed} FAILING contract case(s).\n`
);
process.exit(failed === 0 ? 0 : 1);
