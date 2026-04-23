// Re-patches the Gradle wrapper to 8.14.3 after `expo prebuild`.
//
// Expo SDK 55 prebuild pins Gradle 9.0.0, which on some JDK distributions
// (notably IBM Semeru bundled with Android Studio / EAS build images)
// crashes with an "IBM_SEMERU" JavaLanguageVersion enum error before the
// build even starts. Locally we also patch the wrapper after each prebuild;
// this script is the programmatic equivalent called by the eas.json
// prebuildCommand so EAS cloud builds don't hit it.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const target = path.join(
  root,
  "android",
  "gradle",
  "wrapper",
  "gradle-wrapper.properties"
);

const GRADLE_PIN = "8.14.3";
const distributionLine = `distributionUrl=https\\://services.gradle.org/distributions/gradle-${GRADLE_PIN}-bin.zip`;

if (!fs.existsSync(target)) {
  console.warn(`[patch-gradle] ${target} does not exist — skipping`);
  process.exit(0);
}

const original = fs.readFileSync(target, "utf8");
const patched = original.replace(
  /^distributionUrl=.*$/m,
  distributionLine
);

if (patched === original) {
  console.log(`[patch-gradle] already at Gradle ${GRADLE_PIN}, no change`);
} else {
  fs.writeFileSync(target, patched, "utf8");
  console.log(`[patch-gradle] pinned Gradle wrapper to ${GRADLE_PIN}`);
}
