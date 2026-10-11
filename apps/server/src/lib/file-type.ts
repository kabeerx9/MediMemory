import type { StoredFileMediaType } from "@caretalk/contracts/health";

// Content sniffing for uploaded report originals. The uploader's Content-Type
// and file name are untrusted (an upload link is reachable without a login),
// so the stored media type comes from the bytes. Anything that isn't one of
// these formats is rejected — the file is later served back inline, and an
// HTML or SVG file served from our origin would be stored XSS.

// ISO-BMFF brands used by HEIC/HEIF photos (the iPhone camera default).
const HEIF_BRANDS = new Set(["heic", "heix", "heim", "heis", "hevc", "hevx", "mif1", "msf1"]);

export function sniffMediaType(bytes: Uint8Array): StoredFileMediaType | null {
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));

  if (bytes.length >= 5 && ascii(0, 5) === "%PDF-") return "application/pdf";
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    ascii(1, 4) === "PNG" &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  if (bytes.length >= 12 && ascii(4, 8) === "ftyp" && HEIF_BRANDS.has(ascii(8, 12))) return "image/heic";
  return null;
}

/**
 * A display-safe file name: no path components, no control characters, bounded
 * length. It is only ever shown and used in Content-Disposition, never as a
 * filesystem path (storage keys are server-generated ids).
 */
export function sanitizeFileName(raw: string | null | undefined, fallback: string): string {
  const base = (raw ?? "").split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(/[\u0000-\u001f\u007f"]/g, "").trim().slice(0, 180);
  return cleaned.length > 0 ? cleaned : fallback;
}

export const EXTENSION_FOR: Record<StoredFileMediaType, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/heic": "heic",
};
