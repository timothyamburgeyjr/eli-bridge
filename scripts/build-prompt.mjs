// Regenerates services/geminiPrompt.generated.ts from EliBridge_GeminiSystemPrompt_v1.md.
// Runs via npm prestart / preandroid hooks so the bundled prompt always tracks the .md.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const src = path.join(root, "EliBridge_GeminiSystemPrompt_v1.md");
const out = path.join(root, "services", "geminiPrompt.generated.ts");

const md = fs.readFileSync(src, "utf8");
const body =
  "// AUTO-GENERATED from EliBridge_GeminiSystemPrompt_v1.md — do not hand-edit.\n" +
  "// Regenerated on npm start / npm run android via scripts/build-prompt.mjs.\n" +
  `export const GEMINI_SYSTEM_PROMPT = ${JSON.stringify(md)};\n` +
  `export const GEMINI_SYSTEM_PROMPT_BYTES = ${md.length};\n`;

fs.writeFileSync(out, body, "utf8");
console.log(`[build-prompt] wrote ${out} (${md.length} bytes)`);
