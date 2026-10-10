import { describe, expect, it } from "vitest";

import { sanitizeFileName, sniffMediaType } from "./file-type";

const bytes = (...parts: Array<string | number[]>) =>
  Uint8Array.from(parts.flatMap((part) => (typeof part === "string" ? [...part].map((char) => char.charCodeAt(0)) : part)));

describe("sniffMediaType", () => {
  it.each([
    ["application/pdf", bytes("%PDF-1.7\n")],
    ["image/png", bytes([0x89], "PNG", [0x0d, 0x0a, 0x1a, 0x0a, 0])],
    ["image/jpeg", bytes([0xff, 0xd8, 0xff, 0xe0])],
    ["image/webp", bytes("RIFF", [1, 2, 3, 4], "WEBPVP8 ")],
    ["image/heic", bytes([0, 0, 0, 24], "ftypheic", [0, 0, 0, 0])],
    ["image/heic", bytes([0, 0, 0, 24], "ftypmif1", [0, 0, 0, 0])],
  ])("recognises %s", (expected, input) => {
    expect(sniffMediaType(input)).toBe(expected);
  });

  it.each([
    ["html", bytes("<!doctype html><script>alert(1)</script>")],
    ["svg", bytes('<svg xmlns="http://www.w3.org/2000/svg">')],
    ["mp4 (ftyp, non-HEIF brand)", bytes([0, 0, 0, 24], "ftypisom", [0, 0, 0, 0])],
    ["empty", new Uint8Array()],
    ["truncated pdf magic", bytes("%PD")],
  ])("rejects %s", (_label, input) => {
    expect(sniffMediaType(input)).toBeNull();
  });
});

describe("sanitizeFileName", () => {
  it("drops path components and control characters", () => {
    expect(sanitizeFileName("../../etc/passwd", "x")).toBe("passwd");
    expect(sanitizeFileName("C:\\Users\\dad\\scan.pdf", "x")).toBe("scan.pdf");
    expect(sanitizeFileName('re"port\n.pdf', "x")).toBe("report.pdf");
  });

  it("falls back when nothing usable is left", () => {
    expect(sanitizeFileName("", "report.pdf")).toBe("report.pdf");
    expect(sanitizeFileName(null, "report.pdf")).toBe("report.pdf");
    expect(sanitizeFileName("/", "report.pdf")).toBe("report.pdf");
  });

  it("bounds the length", () => {
    expect(sanitizeFileName(`${"a".repeat(500)}.pdf`, "x").length).toBe(180);
  });
});
