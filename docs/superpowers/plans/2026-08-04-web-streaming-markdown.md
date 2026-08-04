# Web Streaming Markdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render streamed assistant Markdown correctly and safely in the MediMemory web chat without changing user-message or tool-chip rendering.

**Architecture:** A focused `AssistantMarkdown` component owns the web-only rich-text boundary. `WorkspaceChat` decides which assistant response is actively streaming; Streamdown parses and repairs that response while the component policy blocks remote images and permits only HTTPS links.

**Tech Stack:** React 19, Vercel AI SDK `useChat`, Streamdown core, Tailwind CSS 4, Vitest, React DOM server rendering.

## Global Constraints

- Install only core `streamdown`; do not install code, math, Mermaid, or CJK plugins.
- Keep user messages as literal plain text.
- Keep memory/profile tool parts outside the Markdown renderer.
- Do not load remote images from model output.
- Permit outbound links only when their parsed protocol is `https:`; open them in a new tab with `rel="noopener noreferrer"`.
- Use streaming mode only for the latest assistant message while `useChat` reports `streaming`; render historical assistant messages in static mode.
- Do not change the React Native renderer in this plan.
- Do not commit; leave the working tree for user review.

---

### Task 1: Safe streamed assistant renderer

**Files:**
- Create: `apps/web/src/features/health/assistant-markdown.tsx`
- Create: `apps/web/src/features/health/assistant-markdown.test.tsx`
- Modify: `apps/web/src/features/health/workspace-chat.tsx`
- Modify: `apps/web/src/index.css`
- Modify: `apps/web/package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: `children: string` and `isStreaming: boolean` from the chat message view.
- Produces: `AssistantMarkdown({ children, isStreaming }): ReactElement`, with safe link/image component overrides.

- [ ] **Step 1: Add the test dependency and write failing behavior tests**

Add a web `test` script and Vitest dev dependency, then write tests using `renderToStaticMarkup` that independently assert:

```tsx
expect(renderAssistant("A **major** result")).toContain("<strong>major</strong>");
expect(renderAssistant("![scan](https://tracker.example/scan.png)")).not.toContain("<img");
expect(renderAssistant("[report](javascript:alert(1))")).not.toContain("href=");
expect(renderAssistant("[report](https://example.com/report)")).toContain(
  'rel="noopener noreferrer"',
);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm --filter web test -- src/features/health/assistant-markdown.test.tsx`

Expected: FAIL because `AssistantMarkdown` does not exist yet.

- [ ] **Step 3: Implement the minimal renderer**

Create `AssistantMarkdown` around core `Streamdown`. Supply project-owned `a` and `img` components, set `mode` from `isStreaming`, preserve Streamdown's default security plugins, and apply compact chat typography using existing design tokens.

- [ ] **Step 4: Connect assistant messages without changing other parts**

Pass an `isStreaming` flag only to the latest assistant message. Replace the assistant `<p>` with `AssistantMarkdown`; leave the user bubble and tool-part branches unchanged. Import Streamdown's stylesheet once and add its Tailwind `@source` path.

- [ ] **Step 5: Verify GREEN and regression coverage**

Run:

```bash
pnpm --filter web test
pnpm test
pnpm check-types
```

Expected: all tests and type checks pass. Record the web production bundle sizes from `pnpm check-types` and call out the Streamdown cost rather than assuming it is negligible.

- [ ] **Step 6: Review without committing**

Run `git diff --check` and `git status --short`. Confirm the diff contains no native production changes and leave all work unstaged for review.
