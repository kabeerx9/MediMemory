// Learn more https://docs.expo.io/guides/customizing-metro
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// react-native-markdown-display pulls in markdown-it, which requires Node's
// `punycode` core module. Metro (unlike webpack/Node) does not polyfill Node
// core modules on native, so point it at a local no-op shim instead of
// pulling in an extra dependency. See shims/punycode.js for why this is safe.
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  punycode: path.resolve(__dirname, "shims/punycode.js"),
};

module.exports = config;
