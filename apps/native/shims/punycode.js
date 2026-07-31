// Minimal shim for Node's `punycode` core module, which Metro does not
// polyfill on native (unlike Node/webpack). markdown-it (a dependency of
// react-native-markdown-display, used to render assistant chat messages and
// the workspace profile) requires it only to IDN-normalize link hostnames
// during autolinking — a feature this app's plain-text health notes never
// exercise. Identity passthroughs are correct for the ASCII hostnames we
// actually see and keep Metro's resolver happy without adding a dependency.
module.exports = {
  toASCII: (input) => input,
  toUnicode: (input) => input,
  encode: (input) => input,
  decode: (input) => input,
  ucs2: {
    decode: (input) => Array.from(input, (ch) => ch.codePointAt(0)),
    encode: (codePoints) => String.fromCodePoint(...codePoints),
  },
};
