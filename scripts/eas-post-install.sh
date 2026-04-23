#!/usr/bin/env bash
# Runs on EAS build machines after `npm install`, before `expo prebuild`.
#
# 1. Ensures hermesc and any other linux64-bin executables have +x.
#    npm installs often strip exec bits on Linux for some prebuilt
#    binaries, which makes Gradle's `createBundleReleaseJsAndAssets`
#    fail with "A problem occurred starting process '.../hermesc'".
#
# 2. Regenerates services/geminiPrompt.generated.ts from the markdown
#    source — equivalent to the local preandroid / prestart npm hooks.

set -e

echo "[eas-post-install] fixing exec bits on linux binaries..."
find node_modules -type f -path "*/linux64-bin/*" -exec chmod +x {} + 2>/dev/null || true
# Hermes ships binaries in a few places depending on version
find node_modules -type f -name "hermesc" -exec chmod +x {} + 2>/dev/null || true
find node_modules -type f -name "hbcdump" -exec chmod +x {} + 2>/dev/null || true

echo "[eas-post-install] regenerating Gemini system prompt..."
node scripts/build-prompt.mjs

echo "[eas-post-install] done."
