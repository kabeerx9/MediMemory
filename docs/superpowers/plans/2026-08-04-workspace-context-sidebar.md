# Workspace Context Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the stacked right rail with a navigable shadcn patient-context sidebar and eliminate page-level workspace scrolling.

**Architecture:** The root route owns the viewport and contains overflow. `WorkspaceShell` fills that bounded track and gives chat and the context sidebar their own scroll regions. `MemoryRail` becomes a stateful navigation shell whose active section delegates to focused overview, timeline, trends, or memory-list views.

**Tech Stack:** React 19, TanStack Router, Tailwind CSS 4, existing shadcn/Base UI components, Vitest, Playwright.

## Global Constraints

- Leave all work unstaged and uncommitted.
- Preserve the existing mobile Sheet entry point.
- Do not change server contracts or persisted health data.
- Use existing design tokens and shadcn primitives; add no new runtime dependency.
- The browser document must not be a workspace scroll owner.

---

### Task 1: Memory presentation helpers

**Files:**
- Create: `apps/web/src/features/health/memory-rail.test.ts`
- Modify: `apps/web/src/features/health/memory-rail.tsx`

**Interfaces:**
- Produces: `groupMemoriesByDate(memories, showHistory): MemoryGroup[]`
- Produces: `groupMemoriesByKind(memories, showHistory): MemoryKindGroup[]`

- [ ] Write table-driven tests with complete `Memory` fixtures proving reverse date order, undated placement, superseded filtering, and kind grouping.
- [ ] Run `pnpm --filter web test -- memory-rail.test.ts` and confirm failure because the public helpers do not yet exist.
- [ ] Extract the current date grouping and add kind grouping with the same active/history filter.
- [ ] Re-run the focused test and confirm it passes.

### Task 2: Navigable shadcn context sidebar

**Files:**
- Modify: `apps/web/src/features/health/memory-rail.tsx`
- Modify: `apps/web/src/features/health/profile-card.tsx`
- Modify: `apps/web/src/features/health/trends.tsx`
- Test: `apps/web/src/features/health/memory-rail.test.ts`

**Interfaces:**
- `MemoryRail` retains its existing props so `WorkspaceShell` and API refresh behavior remain stable.
- `TrendsSection` renders its complete selected view and exposes a useful empty state.
- Profile editing/version history remains owned by `ProfileCard`.

- [ ] Add a renderer test for the default Overview navigation and its accessible active state; confirm it fails against the stacked rail.
- [ ] Compose `SidebarProvider`, non-collapsible `Sidebar`, `SidebarHeader`, `SidebarMenu`, `SidebarContent`, and `SidebarFooter` into a bounded right-side context surface.
- [ ] Add Overview, Timeline, Trends, and Memories buttons and render exactly one corresponding section.
- [ ] Move add/copy actions into the footer and preserve all mutation callbacks.
- [ ] Refactor Trends to remove its redundant show/hide state and add a no-series empty state.
- [ ] Run the focused test, full web test suite, and type check.

### Task 3: Viewport and overflow containment

**Files:**
- Modify: `apps/web/src/routes/__root.tsx`
- Modify: `apps/web/src/features/health/workspace-shell.tsx`

**Interfaces:**
- Root non-auth layout: `grid-rows-[auto_minmax(0,1fr)] overflow-hidden`.
- Workspace shell and split: full-height, `min-h-0`, `overflow-hidden`.
- Chat message region and sidebar content remain the only desktop vertical scrollers.

- [ ] Reproduce the bug in Playwright and record document, shell, chat, and rail client/scroll heights.
- [ ] Add root-grid and workspace-shell containment classes at each intrinsic sizing boundary.
- [ ] Re-run the same Playwright measurement and confirm document scroll height equals client height.
- [ ] Independently scroll chat and sidebar and confirm neither changes `window.scrollY`.

### Task 4: Responsive and regression verification

**Files:**
- Modify only if verification exposes a defect in the files above.

- [ ] At a desktop viewport, verify all four navigation items, active-content replacement, profile editing entry, timeline/history controls, and add-memory form.
- [ ] At a mobile viewport, verify the right-side Sheet opens, the same navigation works, content scrolls, and the document stays fixed.
- [ ] Run `pnpm --filter web test`.
- [ ] Run `pnpm --filter web check-types`.
- [ ] Inspect the final Playwright screenshots for clipping, nested-scroll confusion, and focus visibility.
