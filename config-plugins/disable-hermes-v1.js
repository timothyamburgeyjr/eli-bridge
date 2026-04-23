// Expo config plugin: force hermesV1Enabled=false in android/gradle.properties.
//
// React Native 0.82's default Gradle plugin looks up hermesc at
//    node_modules/hermes-compiler/hermesc/<os-bin>/hermesc
// when `hermesV1Enabled=true`. That npm package is a stub (0.0.0, just a
// package.json) — the actual hermesc binaries live at
//    node_modules/react-native/sdks/hermesc/<os-bin>/hermesc
// which is what the plugin uses when hermesV1Enabled=false.
//
// On EAS cloud builds, the default ends up TRUE and the build fails at
// `:app:createBundleReleaseJsAndAssets` with:
//   "A problem occurred starting process '.../hermes-compiler/hermesc/linux64-bin/hermesc'"
//
// Forcing the property false via this config plugin makes Gradle use the
// real hermesc at the react-native/sdks location on every fresh prebuild.

const { withGradleProperties } = require("@expo/config-plugins");

/** @param {import("@expo/config").ExpoConfig} config */
module.exports = function withDisableHermesV1(config) {
  return withGradleProperties(config, (c) => {
    const props = c.modResults;
    // Drop any existing entry so we're authoritative, then add our own.
    const filtered = props.filter(
      (p) => !(p.type === "property" && p.key === "hermesV1Enabled")
    );
    filtered.push({
      type: "property",
      key: "hermesV1Enabled",
      value: "false",
    });
    c.modResults = filtered;
    return c;
  });
};
