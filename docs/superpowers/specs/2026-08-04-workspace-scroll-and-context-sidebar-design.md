# Workspace Scroll and Patient Context Sidebar Design

## Goal

Make the workspace behave like a bounded application shell: the browser document never scrolls, chat and patient context scroll independently, and the right rail presents one clearly selected category instead of stacking profile, charts, and memories in one long column.

## Approved direction

Use the existing shadcn sidebar primitives for the patient context surface. The sidebar is navigation plus content, not a dashboard stack.

- Header: workspace/patient identity, a quiet “context updated” timestamp, and the editable profile entry point.
- Navigation: Overview, Timeline, Trends, and Memories. Each item has one icon; Timeline/Memories may show useful counts.
- Content: only the active navigation section renders in the scrolling content region.
- Footer: one primary “Add health update” action and the secondary “Copy for LLM” action.
- Mobile: preserve the current right-side Sheet trigger, but render the same context-sidebar content inside it.

## Information architecture

### Overview

Show the current profile as the default view. This is the briefing users need while chatting. Editing and profile-version history remain available here; the profile is not duplicated elsewhere.

### Timeline

Show active memories grouped reverse-chronologically. This is the date-oriented history view. It excludes superseded records by default and retains the history toggle.

### Trends

Show chartable metric series. The section no longer needs its own show/hide disclosure because navigation already controls visibility. If no series are available, render an explicit empty state.

### Memories

Show all active atomic facts grouped by kind rather than date. This provides a browse/edit surface distinct from Timeline. It retains per-memory edit and delete actions.

## Scroll ownership

There must be exactly three possible vertical scroll owners in the workspace route:

1. Chat messages.
2. Active sidebar content.
3. The mobile Sheet content when the viewport is below the desktop breakpoint.

The document, root grid, workspace shell, chat/sidebar split, and desktop aside must use `min-height: 0` plus overflow containment. The root grid content track must be `minmax(0, 1fr)` rather than a bare `1fr`; this prevents intrinsic content height from expanding the document beyond the viewport.

## Visual direction

Keep the existing light clinical palette and typography. Use one compact density system, quiet Lucide icons, token-based surfaces, a persistent active navigation treatment, and separators instead of nested cards. The distinguishing motif is a “patient briefing index”: the nav makes the information model visible at a glance without making every category compete visually.

## Accessibility and responsive behavior

- Navigation uses buttons with a visible active state and `aria-pressed`.
- Section content has a labelled heading that changes with navigation.
- Keyboard focus remains visible through shadcn token styles.
- Desktop sidebar begins at `lg`; below that, the existing labelled Sheet trigger opens the same UI.
- Motion is limited to existing shadcn transitions and respects the project’s reduced-motion behavior.

## Verification

- Unit tests cover grouping active memories by date and by kind, including superseded-history behavior.
- Existing web tests and type checks pass.
- Playwright checks at desktop and mobile widths that `document.documentElement.scrollHeight === document.documentElement.clientHeight`, while chat and the sidebar can each overflow independently.
- Playwright checks that selecting Overview, Timeline, Trends, and Memories replaces the active content rather than appending another section.
