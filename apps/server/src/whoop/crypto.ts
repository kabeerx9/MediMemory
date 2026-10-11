import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// WHOOP refresh tokens are long-lived credentials to the user's biometric
// data, so they're encrypted at rest with a key that lives only in the server
// env: a database dump alone can't be replayed against WHOOP. AES-256-GCM, so
// a tampered or wrong-key blob fails loudly instead of decrypting to garbage.
//
// Blob format: v1.<iv>.<auth tag>.<ciphertext>, each part base64.

const VERSION = "v1";

export function encryptToken(plain: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [VERSION, iv.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(".");
}

export function decryptToken(blob: string, key: Buffer): string {
  const [version, iv, tag, data] = blob.split(".");
  if (version !== VERSION || !iv || !tag || !data) throw new Error("Unrecognised token format");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}
