# Caretalk

A personal longitudinal health-memory app. One workspace per person you're tracking (a parent, a pregnancy, your own condition). You talk to it in plain language every few days — "hb came back 11.6, he's feeling good, they bumped the lisinopril to 20mg" — and it maintains a structured, dated, auditable memory of the health journey. Then you can ask it anything, and it answers grounded in that memory.

**Live**: https://caretalk-web.vercel.app

## The core idea: agentic memory

Most extraction pipelines run an LLM over your text after the fact and write the results to domain tables. Caretalk does what ChatGPT's memory does instead: **the chat model itself owns memory, through tools, during the conversation**.

The model has two tools:

| Tool | What it does |
|---|---|
| `save_memory` | Saves one atomic fact: content, kind, date, optional `supersedesId` |
| `update_profile` | Rewrites the workspace profile (the always-current snapshot) |

When you say *"hb is 11.6 today"*, the model calls `save_memory` mid-response and you see a chip appear in the chat. When you ask *"what does that number mean?"*, it just answers — no save. The store/don't-store decision is made by the strongest model available, in context, at utterance time, and every write is visible and undoable in the UI.

Three rules make this safe for health data:

1. **Append-only with supersession.** The model never edits or deletes a memory. A state change (dose changed, symptom resolved) writes a new row and marks the old one superseded (`supersededById`), transactionally. History is never lost — the rail's "Show history" reveals the full chain (5mg → 10mg → 20mg).
2. **Measurements accumulate, states supersede.** A new hemoglobin reading never replaces the old one — the series over time is the point. Only genuine state changes supersede. This is enforced in the tool description and the system prompt.
3. **Full context injection, no retrieval.** The entire active memory list (with row IDs) is injected into every chat's system prompt. A workspace is one person's condition — hundreds of facts over years, small enough for context. No vector search means no "top-k silently dropped a medication," and the injected IDs are what let the model target supersessions.

`happenedOn` (when the fact occurred) is stored separately from `createdAt` (when you reported it) — you braindump days late, and "what was true in March" needs the former.

## Where things are stored

PostgreSQL (Supabase in production), six tables in `packages/db/src/schema/health.ts`:

| Table | Holds |
|---|---|
| `workspaces` | One per person/journey. Includes `profile` — a model-maintained markdown block of current state (diagnosis, current meds, next appointment), always injected into chat |
| `memories` | One atomic fact per row: `content`, `kind` (soft tag: measurement/medication/symptom/event/appointment/question/note), `happenedOn`, `supersededById`/`supersededAt`, `sourceId` + `excerpt` (provenance), timestamps. Numeric readings also carry an optional structured shadow — `metric`/`value`/`valueSecondary`/`unit` — so a series can be charted without parsing prose |
| `profile_versions` | The profile's undo history: every change appends the text it replaced, with who replaced it (model / user / restore) |
| `sources` | Immutable raw inputs (pasted transcripts, imports). Never mutated — audit trail and reprocessing input. `contentHash` makes re-importing the same document a no-op instead of a duplicate extraction |
| `chat_sessions` | Conversation threads per workspace |
| `chat_messages` | Full AI SDK UIMessage `parts` as jsonb — tool-call chips survive reload, not just text |

Plus better-auth's `user`/`session`/`account` tables (`schema/auth.ts`). "Active memory" is simply `WHERE superseded_by_id IS NULL`.

## How a chat turn works

```
browser (useChat) ──POST /api/v1/workspaces/:id/sessions/:sid/chat──▶ Fastify
  body carries the browser's IANA time zone alongside the messages
  Fastify: verify ownership → per-user AI rate limit
         → load workspace + active memories
         → resolve "today" in the USER's zone (not the server's UTC)
         → build system prompt (rules + profile + full memory list w/ IDs)
         → persist the user message BEFORE the model runs
         → streamText (AI SDK) with save_memory/update_profile tools
         → tool calls write to Postgres transactionally, mid-stream
         → SSE stream back: text deltas + tool results (rendered as chips)
         → onFinish: persist the assistant UIMessage (failures logged, never thrown)
```

The user message is written up front on purpose: tool calls commit mid-stream, so
persisting both messages at the end meant a dropped connection could leave facts
in the memory rail with no conversation explaining them and no chip to undo from.
The transcript can now lose the reply, never the question.

The model is whatever `AI_MODEL` says (overridable per path with `AI_CHAT_MODEL` /
`AI_IMPORT_MODEL`), served through **OpenRouter** (one key, any provider's model).
On Anthropic models the system prompt is sent with a `cache_control` directive —
it's rules + profile + the entire memory list, re-sent every turn and identical
between turns until a memory changes, which is exactly the shape prompt caching
pays for. Block order in `system-prompt.ts` is load-bearing for this: stable text
first, volatile last.

Import (`POST .../import`) is the same machinery in batch: paste a doctor's note,
`generateText` runs the same tools over it, every created memory carries the
source's ID. It hashes its payload first and short-circuits on a repeat, because
it is the one expensive non-idempotent write in the app.

## Monorepo layout

```
apps/
  web/       React 19 + Vite + TanStack Router + Tailwind 4. Chat-centered UI:
             chat pane (useChat + memory chips), memory rail (profile card +
             dated memory list + history toggle), import page.
  server/    Fastify. Thin routes (zod-parse at the boundary) → health-service
             (orchestration, AI calls) → health-repository (drizzle queries).
             src/lib/memory-tools.ts and system-prompt.ts are the policy core.
  native/    Expo app (React Native). Same API and contracts as web: workspace
             list, chat with memory chips, import. Auth uses better-auth's expo
             plugin (SecureStore), so every request attaches the cookie by hand.
packages/
  contracts/ Zod schemas shared by server and web — request/response shapes
             and the memory-tool input/output contracts.
  db/        Drizzle schema, client, seed script.
  auth/      better-auth config (email/password, cookie sessions).
  env/       Validated env access (server: plain zod; web: t3-env + Vite).
  ui/        Shared shadcn/ui primitives + design tokens.
```

## Deployment

Two Vercel projects from this one repo (rootDirectory per project):

- **caretalk-web** — static Vite build. `vercel.json` rewrites `/api/*` to the server project and everything else to `index.html` (SPA). The proxy is load-bearing: the browser only ever talks to one origin, so auth cookies are **first-party** (separate domains would break login in Safari).
- **caretalk-server** — a single serverless function. esbuild bundles the whole app (workspace packages included) into `api/index.mjs` at build time, so the runtime resolves no TS/workspace imports. `supportsResponseStreaming` keeps the SSE chat stream flowing instead of buffering.
- **Database** — Supabase Postgres via the **transaction pooler** (`aws-1-<region>.pooler.supabase.com:6543`). The direct `db.<ref>.supabase.co` host is IPv6-only and unreachable from Vercel; migrations (`db:push`) run from a dev machine against the direct URL.

## Environment

`apps/server/.env`:

```
DATABASE_URL=            # local Postgres for dev; Supabase pooler URL in prod
BETTER_AUTH_SECRET=      # 32+ chars
BETTER_AUTH_URL=         # the origin the BROWSER sees (frontend domain in prod)
CORS_ORIGIN=             # web app origin
OPENROUTER_API_KEY=      # chat + import stop with a clean 503 without it
AI_MODEL=                # OpenRouter slug, e.g. anthropic/claude-sonnet-4.5

# Access. Comma-separated allowlist; UNSET MEANS ANYONE CAN REGISTER, which on a
# public deployment means anyone can spend your OpenRouter credit. Set it.
ALLOWED_SIGNUP_EMAILS=you@example.com

# Dates. Serverless runs UTC; the client sends its own IANA zone per request and
# this is the fallback when it can't. Wrong value = every relative date the model
# resolves ("yesterday") lands on the wrong day for late-night entries.
APP_TIMEZONE=Asia/Kolkata

# Optional
AI_CHAT_MODEL=           # defaults to AI_MODEL
AI_IMPORT_MODEL=         # defaults to AI_MODEL
AI_PROMPT_CACHE=true     # Anthropic prompt caching via OpenRouter; ignored for other providers
AI_RATE_LIMIT=60         # model-calling requests per user per window
AI_RATE_LIMIT_WINDOW_MS=3600000
```

`apps/web/.env`: `VITE_SERVER_URL` — `http://localhost:3000` in dev; the frontend's own origin in prod (requests go through the proxy).

## Local development

```bash
pnpm install
pnpm db:push                    # apply schema (needs DATABASE_URL)
pnpm dev:server                 # Fastify on :3000
pnpm dev:web                    # Vite on :3001
# optional demo data (after signing up once through the UI):
SEED_USER_EMAIL=you@example.com pnpm -F @caretalk/db seed
```

## Tests

```bash
pnpm test        # pure units: prompt assembly, date/zone, allowlist, hashing, rate limit
pnpm test:db     # + supersession and chat-persistence against Postgres (uses DATABASE_URL)
pnpm eval        # + memory-policy evals against the real model (costs money, needs a key)
```

The evals are the point. Accumulate-vs-supersede, "save the fact, not the
question", and relative-date resolution are enforced by prompt text alone —
nothing in the type system or the schema prevents the model from superseding a
lab result and quietly ending a series. `src/evals/memory-policy.eval.test.ts`
runs the real prompt and real tool descriptions against the real model and
asserts on the tool *calls*. Run it after any edit to the system prompt, a tool
description, or `AI_MODEL`.

A failing eval means behaviour changed — decide whether you want the new
behaviour, don't reflexively loosen the assertion. Cases must be unambiguous:
one early case asked "what does a hemoglobin of 11.6 mean?" and flapped, because
saving 11.6 as a new reading is a perfectly defensible reading of that sentence.

## Design notes / known limits

- Prompt tokens grow linearly with active memory count (full injection). Fine for years at this scale; the pressure valve later is moving old memories behind a search tool, not RAG-ing the core list.
- The model can forget to save (agentic memory's known weakness). Chips make misses visible; "tell it again" is the failure mode, silent corruption is not.
- Undoing a memory chip doesn't revert a profile rewrite from the same turn — but the profile now keeps its own history (`profile_versions`), so the rewrite is recoverable from the rail's "History".
- Report/document bodies beyond ~60k chars and 50+-fact imports push against the serverless `maxDuration`; big backfills are best split.
- The AI rate limit is an in-process counter, so on Vercel the real ceiling is `AI_RATE_LIMIT × warm instances`. It's a spend guard against a runaway client, not a security control — `ALLOWED_SIGNUP_EMAILS` is what keeps strangers out.
- Structured measurement fields (`metric`/`value`/`unit`) are filled by the model alongside the prose, so a chart is only as complete as the model's tagging. `content` stays authoritative; an untagged reading is invisible to Trends but never lost.
- Import dedup is keyed on a hash of title + text + file bytes. A re-scan of the same page is different bytes and counts as a new document.
