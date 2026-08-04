import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { AssistantMarkdown, getStreamingAssistantMessageId } from "./assistant-markdown";

function renderAssistant(children: string, isStreaming = false) {
  return renderToStaticMarkup(
    <AssistantMarkdown isStreaming={isStreaming}>{children}</AssistantMarkdown>,
  );
}

describe("AssistantMarkdown", () => {
  test("renders supported Markdown formatting", () => {
    expect(renderAssistant("A **major** result")).toContain("<strong>major</strong>");
  });

  test("renders headings", () => {
    expect(renderAssistant("# Care plan")).toContain(">Care plan</h1>");
  });

  test("renders unordered lists", () => {
    const html = renderAssistant("- Morning dose\n- Evening dose");

    expect(html).toContain("<ul");
    expect(html).toContain(">Morning dose</");
    expect(html).toContain(">Evening dose</");
  });

  test("renders ordered lists", () => {
    const html = renderAssistant("1. Check pressure\n2. Record result");

    expect(html).toContain("<ol");
    expect(html).toContain(">Check pressure</");
    expect(html).toContain(">Record result</");
  });

  test("keeps escaped HTML as text", () => {
    expect(renderAssistant("&lt;script&gt;alert(1)&lt;/script&gt;")).toContain(
      "&lt;script&gt;alert(1)&lt;/script&gt;",
    );
  });

  test("renders allowed raw HTML", () => {
    expect(renderAssistant("<div>Safe <em>note</em></div>")).toContain(
      "<div>Safe <em>note</em></div>",
    );
  });

  test("does not render Markdown images", () => {
    expect(renderAssistant("![scan](https://tracker.example/scan.png)")).not.toContain("<img");
  });

  test("does not fetch raw HTML images", () => {
    const html = renderAssistant(
      '<img src="https://tracker.example/pixel.png" alt="tracking pixel" onerror="alert(1)">',
    );

    expect(html).not.toContain("<img");
    expect(html).not.toContain("tracker.example");
  });

  test("strips raw JavaScript URLs and event handlers", () => {
    const html = renderAssistant(
      '<a href="javascript:alert(1)" onclick="alert(2)">report</a><span onmouseover="alert(3)">safe</span>',
    );

    expect(html).not.toContain("href=");
    expect(html).not.toContain("onclick");
    expect(html).not.toContain("onmouseover");
  });

  test("does not expose unsafe link protocols", () => {
    expect(renderAssistant("[report](javascript:alert(1))")).not.toContain("href=");
  });

  test("does not expose HTTP links", () => {
    expect(renderAssistant("[report](http://example.com/report)")).not.toContain("href=");
  });

  test("does not expose relative links", () => {
    expect(renderAssistant("[report](/records/123)")).not.toContain("href=");
  });

  test("does not expose malformed links", () => {
    expect(renderAssistant("[report](https://)")).not.toContain("href=");
  });

  test("routes safe links through confirmation before navigation", () => {
    const html = renderAssistant("[report](https://example.com/report)");

    expect(html).toContain("<button");
    expect(html).toContain('data-streamdown="link"');
    expect(html).not.toContain("<a");
    expect(html).not.toContain("href=");
  });

  test("accepts mixed-case HTTPS links after URL normalization", () => {
    const html = renderAssistant("[report](HTTPS://example.com/report)");

    expect(html).toContain("<button");
    expect(html).not.toContain("[blocked]");
  });

  test("repairs incomplete bold input while streaming", () => {
    expect(renderAssistant("A **major", true)).toContain("<strong>major</strong>");
  });

  test("renders an incomplete code fence while streaming", () => {
    const html = renderAssistant("```ts\nconst dose = 10", true);

    expect(html).toContain("<code");
    expect(html).toContain("const dose = 10");
  });
});

describe("getStreamingAssistantMessageId", () => {
  const messages = [
    { id: "user-1", role: "user" },
    { id: "assistant-1", role: "assistant" },
    { id: "user-2", role: "user" },
    { id: "assistant-2", role: "assistant" },
    { id: "user-3", role: "user" },
  ];

  test("selects only the latest assistant while streaming", () => {
    expect(getStreamingAssistantMessageId(messages, "streaming")).toBe("assistant-2");
  });

  test.each(["submitted", "ready"] as const)(
    "selects no assistant while the chat is %s",
    (status) => {
      expect(getStreamingAssistantMessageId(messages, status)).toBeUndefined();
    },
  );
});
