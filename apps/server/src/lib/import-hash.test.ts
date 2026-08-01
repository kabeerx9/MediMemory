import { describe, expect, it } from "vitest";

import { importContentHash } from "./import-hash";

const file = {
  name: "report.pdf",
  mediaType: "application/pdf" as const,
  dataUrl: "data:application/pdf;base64,AAAA",
};

describe("importContentHash", () => {
  it("is stable for the same payload", () => {
    const input = { title: "Cardiology visit", content: "BP 138/86." };
    expect(importContentHash(input)).toBe(importContentHash(input));
  });

  it("ignores surrounding whitespace, which a paste routinely adds", () => {
    expect(importContentHash({ title: "Visit", content: "BP 138/86." })).toBe(
      importContentHash({ title: "  Visit  ", content: "\nBP 138/86.\n" }),
    );
  });

  it("separates fields so content can't be shifted into the title", () => {
    expect(importContentHash({ title: "ab", content: "c" })).not.toBe(
      importContentHash({ title: "a", content: "bc" }),
    );
  });

  it("distinguishes different content, titles, and files", () => {
    const baseline = importContentHash({ title: "Visit", content: "BP 138/86." });
    expect(importContentHash({ title: "Visit", content: "BP 140/90." })).not.toBe(baseline);
    expect(importContentHash({ title: "Other visit", content: "BP 138/86." })).not.toBe(baseline);
    expect(importContentHash({ title: "Visit", content: "BP 138/86.", file })).not.toBe(baseline);
  });

  it("treats an attached file alone as hashable", () => {
    const input = { title: "Scan", file };
    expect(importContentHash(input)).toBe(importContentHash(input));
    expect(importContentHash({ title: "Scan" })).not.toBe(importContentHash(input));
  });
});
