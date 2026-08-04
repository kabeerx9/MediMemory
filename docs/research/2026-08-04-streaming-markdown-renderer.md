# Rendering streamed AI Markdown in MediMemory

Date: 2026-08-04

## Recommendation

Use **Streamdown directly in the web chat for assistant text**, without its optional code, math, Mermaid, or CJK plugins. Keep user messages as plain text. Configure links deliberately and disable remote images.

This is the best fit because MediMemory already uses Vercel AI SDK's `useChat`, receives assistant text incrementally, uses React 19, Tailwind 4, and shadcn-style design tokens. Streamdown is a React renderer specifically built for incomplete streamed Markdown, and it is also the renderer underneath Vercel's AI Elements `MessageResponse` component. Its default pipeline includes GFM, sanitization, URL hardening, block-level memoization, and repair of unterminated Markdown while a response is arriving. [Streamdown README](https://github.com/vercel/streamdown/blob/main/packages/streamdown/README.md) [Streamdown source](https://github.com/vercel/streamdown/blob/main/packages/streamdown/index.tsx) [Vercel AI Elements Message](https://elements.ai-sdk.dev/components/message)

Do not replace the existing native renderer in the same change. React DOM renderers do not render native React Native views. The native app already renders assistant messages through `react-native-markdown-display`; plan a separate, tested migration to `react-native-enriched-markdown`, because the current library now labels itself unmaintained and recommends that successor. [Current renderer README](https://github.com/iamacup/react-native-markdown-display) [Successor README/package](https://www.npmjs.com/package/react-native-enriched-markdown)

## What is broken now

The model is producing Markdown correctly; the web client is displaying the Markdown source as ordinary text. In `apps/web/src/features/health/workspace-chat.tsx:199-202`, assistant text is placed directly inside a `<p>`. Consequently, `**bold**`, headings, lists, and links remain literal characters. This is a presentation-layer issue, not a model or streaming protocol issue.

The native path is already different: `apps/native/app/workspace/[workspaceId]/(tabs)/index.tsx:316-318` passes assistant text to a Markdown component, so it should not exhibit the same literal-asterisk problem.

## Options compared

| Option | Streaming partial Markdown | Security posture | Fit here | Costs |
| --- | --- | --- | --- | --- |
| `react-markdown` + `remark-gfm` + `rehype-sanitize` | Correctly reparses each current string, but is not designed to repair incomplete syntax. A dangling `**`, code fence, table row, or link may temporarily appear as source or change shape when closed. | `react-markdown` is safe by default because it builds React elements and does not use `dangerouslySetInnerHTML`; its maintainers recommend `rehype-sanitize` after untrusted plugins. Raw HTML should remain disabled. | Good minimal fallback and the most conservative dependency choice. | Less polished token-by-token rendering; more styling work; no built-in streaming repair or block-level streaming optimization. |
| `streamdown` | Purpose-built. Its default mode is `streaming`, incomplete parsing defaults on, `remend` repairs unterminated Markdown before parsing, and blocks are memoized/stably keyed so earlier blocks need not remount as the tail grows. | Defaults include `rehype-raw`, `rehype-sanitize`, and `rehype-harden`, plus a link-safety UI. The default sanitizer is the important boundary; application policy is still needed for outbound links and images. | Best match for an AI SDK streaming chat. Vercel's AI Elements response component uses it. | Broader dependency and UI surface than the minimal stack; requires its stylesheet and a Tailwind `@source` path; fast-moving 2.x API deserves a pinned version and upgrade review. |
| Vercel AI Elements `MessageResponse` | Uses Streamdown and advertises smart streaming, GFM, math, and code rendering. | Inherits Streamdown's rendering path; the copied component remains application-owned code. | Useful if MediMemory also wants message actions, branching, attachments, sources, and a fuller chat-component system. | Too much UI adoption for fixing one rendering defect; overlaps the existing custom Caretalk message/tool-chip UI. |

Sources: [`react-markdown` README and security notes](https://github.com/remarkjs/react-markdown), [`remark-gfm` manifest/feature description](https://github.com/remarkjs/remark-gfm/blob/main/package.json), [`rehype-sanitize` documentation](https://github.com/rehypejs/rehype-sanitize), [Streamdown package source](https://github.com/vercel/streamdown/blob/main/packages/streamdown/index.tsx), and [AI Elements Message documentation](https://elements.ai-sdk.dev/components/message).

### Why Streamdown wins over the minimal stack

Both choices solve the visible `**` problem after a response completes. The differentiator is the period while the response is streaming. A regular CommonMark parser cannot treat an opening delimiter as bold until it sees the closing delimiter. Streamdown explicitly preprocesses incomplete input with `remend`, separates content into blocks, updates blocks with stable keys, and has a static mode for completed content. These are the exact failure modes of token-streamed model output, rather than general Markdown features added around the edges. [Streamdown implementation](https://github.com/vercel/streamdown/blob/main/packages/streamdown/index.tsx)

Vercel's official AI Elements documentation describes `MessageResponse` as supporting GFM, smart streaming, math, and code blocks, and the Streamdown project states that it powers that component. Therefore direct Streamdown adoption follows the same rendering choice without replacing MediMemory's current message layout. [AI Elements Message](https://elements.ai-sdk.dev/components/message) [Streamdown README](https://github.com/vercel/streamdown/blob/main/packages/streamdown/README.md)

### Why not adopt the whole AI Elements message component now

The current web component already owns alignment, starter prompts, errors, scrolling, typing status, and special memory/profile tool parts. AI Elements adds a broader message system with response branches, actions, attachments, code UI, and related behavior. Its docs install the component through a code-generating CLI, so this is source adoption rather than a small opaque library call. Using only Streamdown preserves MediMemory's module boundary: `WorkspaceChat` still owns chat behavior; a small assistant-response component owns rich-text rendering.

## Security and privacy policy

Model output must be treated as untrusted. Imported documents and user messages can influence it, and even benign model output can contain an unsafe or misleading URL.

1. **Do not enable arbitrary executable HTML.** `react-markdown` escapes/ignores raw HTML unless `rehype-raw` is added. If the minimal stack is chosen, do not add `rehype-raw`; keep `rehype-sanitize` last after any plugin that could introduce HTML. The sanitizer's own docs warn that anything after it can be unsafe. [`react-markdown` security guidance](https://github.com/remarkjs/react-markdown#security) [`rehype-sanitize` security guidance](https://github.com/rehypejs/rehype-sanitize#security)
2. **Keep Streamdown's default sanitizer and hardener.** Its default pipeline parses raw markup, applies the GitHub-style sanitize schema, then applies `rehype-harden`. Do not replace `rehypePlugins` casually, because doing so replaces that default array. [Default plugin pipeline](https://github.com/vercel/streamdown/blob/main/packages/streamdown/index.tsx)
3. **Disable remote images in chat.** Even a safe `<img src="https://…">` causes the browser to contact a third party. In a health app, that leaks IP/user-agent/timing data and creates a tracking surface. Render image Markdown as a harmless link or omit it. This is an application privacy requirement beyond XSS sanitation.
4. **Constrain and label outbound links.** Permit only `https:` (and optionally `mailto:`/`tel:` if explicitly wanted), use `rel="noopener noreferrer"` for new tabs, and keep Streamdown's link-safety confirmation enabled. Streamdown exposes `components`, `linkSafety`, and custom plugin configuration; its default source shows link safety enabled. [Streamdown props and defaults](https://github.com/vercel/streamdown/blob/main/packages/streamdown/index.tsx)
5. **Keep user text plain.** Users should see exactly what they typed; parsing user Markdown adds no medical value and creates another link/image surface.

Sanitization prevents markup execution. It does not prove that a medical claim or destination URL is trustworthy. Those are separate content-safety concerns.

## Integration shape

The smallest implementation should:

- add `streamdown` only to `apps/web`;
- import `streamdown/styles.css` once;
- add the correct Tailwind `@source` entry relative to `apps/web/src/index.css` in this pnpm monorepo, as required by Streamdown's monorepo instructions;
- introduce an `AssistantMarkdown` component with constrained `components` for links and images;
- pass `mode="streaming"` only to the actively streaming assistant response and `mode="static"` to completed responses;
- leave tool parts (`tool-save_memory`, `tool-update_profile`) outside the Markdown renderer;
- add rendering tests for bold, headings, ordered/unordered lists, links, escaped/raw HTML, an image, and incomplete `**bold`/code-fence input.

Do not install the optional `@streamdown/code`, `@streamdown/math`, `@streamdown/mermaid`, or `@streamdown/cjk` packages yet. Medical chat presently needs readable prose, lists, tables, emphasis, and safe links. Optional rendering expands bundle size and security/maintenance surface without serving the current use case. Streamdown documents those capabilities as separate optional plugins and requires separate Tailwind source entries for them. [Streamdown installation and plugin documentation](https://github.com/vercel/streamdown/blob/main/packages/streamdown/README.md)

One implementation nuance: `useChat` exposes a conversation-wide status. The renderer should mark only the latest assistant message as streaming; applying streaming animation/repair to every historical message wastes work and can make completed content move unnecessarily.

## Bundle and maintenance considerations

No trustworthy first-party source publishes an apples-to-apples compressed bundle measurement for these exact configurations, so the change should be measured using this repository's Vite production build rather than quoting a third-party calculator.

The dependency manifests still show the direction of the tradeoff:

- `react-markdown` is a focused unified/remark-to-React pipeline and declares `sideEffects: false`; GFM and sanitation are separate focused packages. [`react-markdown` package manifest](https://github.com/remarkjs/react-markdown/blob/main/package.json) [`remark-gfm` package manifest](https://github.com/remarkjs/remark-gfm/blob/main/package.json) [`rehype-sanitize` package manifest](https://github.com/rehypejs/rehype-sanitize/blob/main/package.json)
- Streamdown includes the unified/remark/rehype pipeline plus `marked`, `remend`, hardening, Tailwind helpers, and UI behavior; optional highlighters/math/diagram renderers are separate packages. Its current package is React 18/19 compatible and has active tests and benchmarks, but its larger surface means more upgrade review. [Streamdown package manifest](https://github.com/vercel/streamdown/blob/main/packages/streamdown/package.json)

Acceptance should compare the existing and new `vite build` output and record the gzip/brotli delta. If the core-only Streamdown delta is unacceptable, the fallback is `react-markdown` + `remark-gfm` + `rehype-sanitize`; the functional tradeoff is temporary formatting instability at the streamed tail.

## React Native

The web renderer cannot be shared as a component with native because `react-markdown` and Streamdown produce DOM elements. A cross-platform abstraction can share policy and visual intent, but it needs platform implementations (`AssistantMarkdown.web.tsx` and `AssistantMarkdown.native.tsx`).

MediMemory's current `react-native-markdown-display@7.0.2` renders native components and supports CommonMark, but its own repository now says it is no longer actively maintained. It recommends `react-native-enriched-markdown`, which uses native rendering/MD4C, supports CommonMark and GFM, text selection, accessibility, RTL, iOS/Android/macOS/web, and requires React Native's New Architecture. Its Expo installation also requires a native prebuild and will not work in Expo Go. [Current renderer repository](https://github.com/iamacup/react-native-markdown-display) [Enriched Markdown package documentation](https://www.npmjs.com/package/react-native-enriched-markdown)

The native app is already on React Native 0.83 and has an `ios` project, so it is a plausible candidate, but the migration should be separate because it changes native dependencies and requires a rebuild. Verify iOS and Android rendering, link handling, accessibility, and incremental message updates before removing the current package. Streamdown's incomplete-Markdown repair behavior is web-specific; do not assume the native successor provides the same streaming semantics without a focused test.

## Decision summary

- **Now, web:** Streamdown core, wrapped in a small project-owned `AssistantMarkdown` component, with remote images disabled and links constrained.
- **Not now:** full AI Elements message adoption or optional math/code/Mermaid plugins.
- **Fallback if bundle measurement fails:** `react-markdown` + `remark-gfm` + `rehype-sanitize`.
- **Native:** keep the existing renderer for this fix, then migrate independently to `react-native-enriched-markdown` because the installed package is unmaintained.
