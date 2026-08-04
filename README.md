# Caretalk

A personal longitudinal health-memory app. One workspace per person you're tracking (a parent, a pregnancy, your own condition). You talk to it in plain language every few days — *"hb came back 11.6, he's feeling good, they bumped the lisinopril to 20mg"* — and it maintains a structured, dated, auditable memory of the health journey. Then you can ask it anything, and it answers grounded in that memory.

**Live**: https://caretalk-web.vercel.app

---

## Contents

- [The 60-second version](#the-60-second-version)
- [System at a glance](#system-at-a-glance)
- [The core idea: agentic memory](#the-core-idea-agentic-memory)
- [Anatomy of a chat turn](#anatomy-of-a-chat-turn) ← the one to read
- [What the model actually sees](#what-the-model-actually-sees)
- [The memory model](#the-memory-model)
- [Accumulate vs supersede](#accumulate-vs-supersede)
- [Following one measurement end to end](#following-one-measurement-end-to-end)
- [The import path](#the-import-path)
- [The profile and its history](#the-profile-and-its-history)
- [Auth and access control](#auth-and-access-control)
- [Time zones](#time-zones)
- [Code map](#code-map)
- [Deployment](#deployment)
- [Environment](#environment)
- [Local development](#local-development)
- [Tests and evals](#tests-and-evals)
- [Design notes and known limits](#design-notes-and-known-limits)

---

## The 60-second version

You type a sentence. A model reads it *with your entire health history already in
context*, decides mid-response whether anything in it is worth remembering
forever, and writes those facts to Postgres through tools while it's still
talking to you. You watch each write appear as a chip you can undo.

```mermaid
flowchart LR
  U["You type:<br/>'hb came back 11.6 today'"] --> API["Fastify"]
  API --> P["Build system prompt:<br/>rules + profile +<br/>every active fact"]
  P --> M["Model"]
  M -->|"tool call"| T["save_memory"]
  T --> DB[("Postgres")]
  M -->|"streamed text"| U2["Answer + a chip<br/>you can undo"]
  DB --> R["Memory rail<br/>and Trends"]

  style T fill:#ede9fe,stroke:#7c3aed
  style DB fill:#e0f2fe,stroke:#0369a1
```

The rest of this document is that picture, zoomed in.

---

## System at a glance

```mermaid
flowchart TB
  subgraph clients["Clients"]
    W["Web<br/>React 19 · Vite · TanStack Router"]
    N["Native<br/>Expo · React Native"]
  end

  subgraph vercel["Vercel"]
    PROXY["caretalk-web<br/>static SPA + /api/* rewrite"]
    API["caretalk-server<br/>one serverless function<br/>Fastify, esbuild-bundled"]
  end

  subgraph external["External"]
    DB[("Supabase Postgres<br/>transaction pooler")]
    OR["OpenRouter"]
    MODEL["Any provider's model<br/>default: Claude Sonnet 4.5"]
  end

  W -->|"same-origin, cookies first-party"| PROXY
  PROXY -->|"rewrite"| API
  N -->|"cross-origin + Cookie header<br/>from SecureStore"| API
  API --> DB
  API --> OR --> MODEL

  style API fill:#ede9fe,stroke:#7c3aed
  style DB fill:#e0f2fe,stroke:#0369a1
```

**Why the proxy exists.** The browser only ever talks to one origin. If the web
app called the API on a different domain, the auth cookie would be third-party
and Safari would drop it — login would silently fail on iOS. Native has no cookie
jar at all, so better-auth's Expo plugin keeps the session in SecureStore and
every request attaches it by hand.

### Inside the server

Three layers, one direction. Nothing skips a layer.

```mermaid
flowchart TD
  RT["<b>routes/health-memory.ts</b><br/>session check · rate limit · zod parse<br/><i>knows HTTP, knows nothing else</i>"]
  SV["<b>services/health-service.ts</b><br/>orchestration · prompt assembly · model calls<br/><i>knows the workflow</i>"]
  RP["<b>repositories/health-repository.ts</b><br/>drizzle queries · row-to-contract mapping<br/><i>the only thing that talks SQL</i>"]

  PROMPT["lib/system-prompt.ts<br/><i>what the model is told</i>"]
  TOOLS["lib/memory-tools.ts<br/><i>what the model can do</i>"]
  DB[("Postgres")]

  RT --> SV
  SV --> RP
  SV --> PROMPT
  SV --> TOOLS
  TOOLS -->|"writes during the stream"| DB
  RP --> DB

  style PROMPT fill:#fef3c7,stroke:#b45309
  style TOOLS fill:#fef3c7,stroke:#b45309
```

The two yellow files are the whole product. `system-prompt.ts` decides what the
model knows; `memory-tools.ts` decides what it can change. Everything else is
plumbing around those two.

Note the one asymmetry: **tools write straight to Postgres mid-stream**, not
through the repository and not at the end of the turn. That's deliberate, and it
drives several design choices later in this document.

---

## The core idea: agentic memory

Most extraction pipelines run an LLM over your text *after the fact* and write
results to domain tables. Caretalk does what ChatGPT's memory does instead: **the
chat model owns memory, through tools, during the conversation.**

```mermaid
flowchart LR
  subgraph after["Typical pipeline"]
    direction TB
    A1["User writes"] --> A2["Store raw text"] --> A3["Later: extractor LLM"] --> A4["Domain tables"]
  end

  subgraph agentic["Caretalk"]
    direction TB
    B1["User writes"] --> B2["Chat model reads it<br/>with full history in context"]
    B2 --> B3["Decides in the moment"]
    B3 --> B4["Calls save_memory<br/>you see the chip"]
  end

  style agentic fill:#f5f3ff
```

The model has exactly two tools:

| Tool | What it does |
|---|---|
| `save_memory` | Saves one atomic fact: content, kind, date, optional `supersedesId`, optional `metric`/`value`/`unit` |
| `update_profile` | Rewrites the workspace profile — the always-current snapshot |

When you say *"hb is 11.6 today"*, the model calls `save_memory` mid-response and
a chip appears in the chat. When you ask *"what does that number mean?"*, it just
answers — no save. The store/don't-store decision is made by a strong model, in
context, at utterance time, and **every write is visible and undoable**.

Three rules make this safe for health data:

1. **Append-only with supersession.** The model never edits or deletes. A state
   change writes a new row and marks the old one superseded, transactionally.
2. **Measurements accumulate, states supersede.** A new hemoglobin reading never
   replaces the old one — the series *is* the point.
3. **Full context injection, no retrieval.** The entire active memory list rides
   in every prompt, with row IDs. No vector search means no *"top-k silently
   dropped a medication"*, and the IDs are what let the model target a supersession.

---

## Anatomy of a chat turn

This is the core loop. Everything else in the app is a variation on it.

```mermaid
sequenceDiagram
  autonumber
  participant B as Browser<br/>(useChat)
  participant R as Route
  participant S as Service
  participant D as Postgres
  participant M as Model<br/>(via OpenRouter)

  B->>R: POST /workspaces/:id/sessions/:sid/chat<br/>{ messages, timeZone }
  R->>R: resolve session cookie → userId<br/>(401 if absent)
  R->>R: per-user AI rate limit<br/>(429 if exceeded)
  R->>S: chatStream(userId, ids, messages, timeZone)

  S->>D: load workspace WHERE owner = userId
  Note over S,D: ownership is a WHERE clause,<br/>not an if-statement
  S->>D: load active memories<br/>(superseded_by_id IS NULL)
  S->>S: today = now in the USER's zone
  S->>S: assemble system prompt

  S->>D: persist the USER message
  Note over S,D: before the model runs, not after

  S->>M: streamText(system, messages, tools)

  loop up to 20 steps
    M-->>B: text delta (streams as it types)
    M->>S: tool call: save_memory
    S->>D: BEGIN · insert new · close old · COMMIT
    D-->>S: row
    S-->>B: tool result → renders as a chip
  end

  M-->>S: done
  S->>D: persist the ASSISTANT message
  Note over S,D: wrapped in try/catch —<br/>response is already sent
```

### Why the user message is written before the model runs

Look at the `BEGIN … COMMIT` *inside* the loop: **tool calls commit to Postgres
mid-stream**, while the model is still talking. If both messages were persisted
at the end (the obvious design), a closed tab or a function timeout would leave
you with facts in the memory rail, no conversation explaining where they came
from, and no chip to undo them from.

```mermaid
flowchart TB
  subgraph bad["Persist at the end"]
    direction TB
    X1["tool writes fact ✓"] --> X2["connection drops ✗"]
    X2 --> X3["<b>Fact exists.<br/>No message. No undo.</b>"]
  end

  subgraph good["Persist up front"]
    direction TB
    Y1["user message ✓"] --> Y2["tool writes fact ✓"]
    Y2 --> Y3["connection drops ✗"]
    Y3 --> Y4["<b>Fact exists.<br/>Question explains it.</b>"]
  end

  style X3 fill:#fee2e2,stroke:#b91c1c
  style Y4 fill:#dcfce7,stroke:#15803d
```

The transcript can now lose the reply, never the question.

The final assistant write is wrapped in try/catch and logged rather than thrown:
it runs *after* the response has been streamed to the browser, so throwing there
can't reach the user — it only produces an unhandled rejection that hides why a
reply went missing on reload.

### The step budget

Models emit roughly one tool call per step. A single message can legitimately
carry several facts — *"bp was 138/86, he skipped the evening dose, and the
cardiologist moved to the 12th"*. The chat cap is **20 steps**; import gets
**120**, because a backfill can be 50+ facts. Too low and later facts vanish with
no error anywhere.

---

## What the model actually sees

Every turn sends one assembled system prompt. Block order is not cosmetic.

```mermaid
flowchart TB
  H["<b>1. Identity + safety</b><br/>not a doctor · ground answers in memory<br/>today's date in the user's zone"]
  R["<b>2. Memory rules</b><br/>what to save · what never to save<br/>accumulate vs supersede · measurement fields"]
  MO["<b>3. Mode block</b><br/>chat: nothing · import: extract everything"]
  P["<b>4. Workspace profile</b><br/>the always-current snapshot"]
  MEM["<b>5. Every active memory</b><br/><code>id | date | kind | fact [metric]</code>"]

  H --> R --> MO --> P --> MEM

  style H fill:#e0f2fe,stroke:#0369a1
  style R fill:#e0f2fe,stroke:#0369a1
  style MO fill:#e0f2fe,stroke:#0369a1
  style P fill:#fef3c7,stroke:#b45309
  style MEM fill:#fee2e2,stroke:#b91c1c
```

Blue is stable across turns. Red changes whenever a memory is written. **Stable
first, volatile last** — that ordering is what makes prompt caching pay: on
Anthropic models the prompt carries a `cache_control` directive, and a new memory
invalidates only the tail of the cached prefix instead of the whole thing. Since
the memory list is re-sent on every single turn and grows for the life of the
workspace, this is the single biggest lever on running cost.

Two details in block 5 that carry weight:

- **Row IDs are rendered.** This is the only reason `supersedesId` can work — the
  model literally cannot target a supersession it can't name.
- **`[metric]` tags are rendered.** The model sees the slug it used for this
  quantity last time and reuses it, instead of inventing `hemoglobin` today and
  `hb_level` next month and splitting one series into two.

---

## The memory model

```mermaid
erDiagram
  user ||--o{ workspaces : owns
  workspaces ||--o{ memories : contains
  workspaces ||--o{ sources : contains
  workspaces ||--o{ profile_versions : "history of"
  workspaces ||--o{ chat_sessions : contains
  chat_sessions ||--o{ chat_messages : contains
  sources ||--o{ memories : "provenance"
  memories ||--o| memories : "superseded by"

  workspaces {
    text id PK
    text owner_user_id FK
    text name
    text profile "injected every turn"
  }
  memories {
    text id PK
    text content "authoritative prose"
    text kind "soft tag"
    text happened_on "when it happened"
    text metric "chartable shadow"
    float value
    float value_secondary "diastolic"
    text unit
    text superseded_by_id FK
    text source_id FK
  }
  sources {
    text id PK
    text content "immutable"
    text content_hash "import dedup key"
  }
  profile_versions {
    text id PK
    text profile "the text it REPLACED"
    text changed_by "model | user | restore"
  }
```

**Active memory** is just `WHERE superseded_by_id IS NULL`. There is no status
column and no soft-delete flag — the link *is* the state.

### Two timestamps that mean different things

| Column | Meaning |
|---|---|
| `happened_on` | when the fact occurred |
| `created_at` | when you told the app |

You braindump days late. *"What was true in March"* needs the former; *"what did
I report yesterday"* needs the latter. Conflating them is a bitemporal modelling
mistake that's very hard to unwind after a year of data.

### Lifecycle of a single fact

```mermaid
stateDiagram-v2
  [*] --> Active: save_memory
  Active --> Superseded: a later fact supersedes it<br/>(same transaction)
  Superseded --> Active: undo — deleting the newer row<br/>reopens this one
  Active --> [*]: delete / undo chip

  note right of Superseded
    Still in the table. Still exported.
    Hidden from the rail until
    "Show history" is clicked.
  end note
```

A dose history reads as a chain: 5mg → 10mg → 20mg, every link intact.

### The supersession transaction

```mermaid
flowchart TB
  A["save_memory with supersedesId"] --> B{"Does that row exist,<br/>in THIS workspace,<br/>and still active?"}
  B -->|no| C["Save as a plain add.<br/>Fact lands, link is dropped."]
  B -->|yes| D["BEGIN"]
  D --> E["INSERT the new fact"]
  E --> F["UPDATE old:<br/>superseded_by_id, superseded_at"]
  F --> G["COMMIT"]

  style C fill:#fef3c7,stroke:#b45309
  style G fill:#dcfce7,stroke:#15803d
```

Two things worth naming:

- **A stale ID never costs you the fact.** A wrong `supersedesId` degrades to an
  ordinary save rather than failing the turn. You lose a link, not a health update.
- **Cross-workspace supersession is impossible.** The lookup is scoped by
  `workspaceId`, and the tools are built bound to one workspace before the model
  ever sees them — the model cannot choose which workspace it writes to, so a
  confused tool call can't cross tenants.

---

## Accumulate vs supersede

This is the one rule that silently destroys data when it goes wrong. Superseding
a lab result ends a series, and nothing downstream would ever notice.

```mermaid
flowchart TD
  START["A new fact arrives"] --> Q1{"Is it a measurement<br/>or lab value?"}
  Q1 -->|yes| ACC["<b>ACCUMULATE</b><br/>save, no supersedesId<br/><i>the series is the point</i>"]
  Q1 -->|no| Q2{"Does it replace a<br/>prior state?<br/>dose changed, symptom<br/>resolved, appointment moved"}
  Q2 -->|no| ACC2["<b>ADD</b><br/>plain save"]
  Q2 -->|yes| Q3{"Certain it's the same<br/>thing changing?"}
  Q3 -->|yes| SUP["<b>SUPERSEDE</b><br/>save with supersedesId"]
  Q3 -->|"not sure"| ASK["<b>SAVE WITHOUT LINKING</b><br/>then ask one short<br/>clarifying question"]

  style ACC fill:#dcfce7,stroke:#15803d
  style SUP fill:#ede9fe,stroke:#7c3aed
  style ASK fill:#fef3c7,stroke:#b45309
```

Enforced in three places, because prompt text alone is not a guarantee:

1. The tool description the model reads
2. The system prompt rules block
3. **`pnpm eval`** — a live-model test asserting on the actual tool calls

That third one is the only real check. See [Tests and evals](#tests-and-evals).

---

## Following one measurement end to end

From typing to sparkline, for *"his bp this morning was 138/86"*.

```mermaid
flowchart TD
  T["You type it"] --> M["Model recognises a paired reading"]
  M --> C["save_memory(<br/>content: 'Blood pressure 138/86 mmHg',<br/>kind: 'measurement',<br/>metric: 'blood_pressure',<br/>value: 138, valueSecondary: 86,<br/>unit: 'mmHg', happenedOn: today)"]
  C --> N["normalizeMetric()<br/>lowercase, snake_case, trimmed"]
  N --> DB[("one row in memories")]
  DB --> RAIL["Memory rail<br/>grouped by date"]
  DB --> TREND["Trends<br/>grouped by metric"]
  TREND --> SVG["Inline SVG sparkline<br/>two lines, shared scale"]

  style C fill:#ede9fe,stroke:#7c3aed
  style SVG fill:#dcfce7,stroke:#15803d
```

Design choices in that path:

- **Blood pressure is one memory, not two.** Systolic and diastolic are a single
  observation; splitting them would let one be deleted without the other.
- **Prose stays authoritative.** `content` is the record. `metric`/`value`/`unit`
  are an *optional shadow* that exists only so a series can be charted. An
  untagged reading is invisible to Trends but never lost.
- **Slugs are normalized server-side**, not trusted from the model. `"Hemoglobin"`,
  `"hb level"` and `"HEMOGLOBIN"` all collapse to `hemoglobin`, so a series
  survives model swaps and prompt edits.
- **No chart library.** Two polylines on a shared scale in a 360px rail don't
  justify shipping ~50kB of dependency.

---

## The import path

Same machinery, no conversation. Paste a doctor's note or attach a PDF or photo;
`generateText` runs the same two tools over it, and every created memory carries
the source's ID as provenance.

```mermaid
sequenceDiagram
  autonumber
  participant U as Client
  participant S as Service
  participant D as Postgres
  participant M as Model

  U->>S: POST /import { title, content?, file?, timeZone, force? }
  S->>S: hash(title + text + file bytes)

  alt already imported and not forced
    S->>D: find source by hash
    D-->>S: the original source
    S-->>U: { duplicateOf, memories } — <b>no model call</b>
    U->>U: "You already imported this. Import anyway?"
  else new, or forced
    S->>D: insert source (immutable)
    S->>M: generateText, up to 120 steps
    loop each fact found
      M->>S: save_memory
      S->>D: insert with source_id
    end
    S-->>U: { source, memories, profileUpdated }
  end
```

**Why hash first.** Import is the one expensive, non-idempotent write in the app.
Running the same PDF twice extracts every fact twice, and nothing downstream can
tell the copies apart — the injected memory list makes duplicate detection
advisory, not enforced. The hash turns *"did I already import this?"* from a
judgement call into a database question, answered before any money is spent.

The title is part of the hash on purpose: re-importing identical bytes under a
new title is a deliberate act, not an accident.

**Files are never stored.** The bytes ride the request, go to the model once, and
are dropped. The `sources` row records only that a file was the origin.

---

## The profile and its history

The profile is a short markdown snapshot of current state — diagnosis, current
treatment, next appointment. It's injected into every prompt, which makes it the
highest-leverage text in the system and the most dangerous to lose.

It's also the only **destructive** write in an otherwise append-only design: both
the model's `update_profile` and your manual edit fully replace it. So every
change snapshots the outgoing text first, in the same transaction.

```mermaid
sequenceDiagram
  participant C as Caller<br/>(tool · edit · restore)
  participant W as writeProfile()
  participant D as Postgres

  C->>W: writeProfile(workspaceId, newText, changedBy)
  W->>D: BEGIN
  W->>D: SELECT current profile
  alt text actually changed
    W->>D: INSERT the OLD text into profile_versions
  else no-op save
    Note over W,D: no version — otherwise every<br/>rail save stacks a duplicate
  end
  W->>D: UPDATE workspaces SET profile
  W->>D: COMMIT
```

Every path funnels through that one function, so history can't half-commit and a
hand-edit is as recoverable as a model rewrite. **Restore is itself a versioned
write**, so rolling back never strands you — you can always roll forward again:

```
v1 written  →  versions: []
v2 written  →  versions: [v1]
restore v1  →  versions: [v2, v1]     ← v2 still recoverable
```

---

## Auth and access control

```mermaid
flowchart TD
  REQ["Request"] --> SESS{"Valid session cookie?"}
  SESS -->|no| E401["401"]
  SESS -->|yes| RL{"Under the AI<br/>rate limit?"}
  RL -->|no| E429["429 + retry-after"]
  RL -->|yes| OWN{"workspace.owner_user_id<br/>= this user?"}
  OWN -->|no| E404["404 — not 403.<br/>Don't confirm it exists."]
  OWN -->|yes| OK["Handler runs"]

  style E401 fill:#fee2e2,stroke:#b91c1c
  style E429 fill:#fee2e2,stroke:#b91c1c
  style E404 fill:#fee2e2,stroke:#b91c1c
  style OK fill:#dcfce7,stroke:#15803d
```

Ownership is enforced as a `WHERE owner_user_id = $userId` clause on the lookup
itself, not as a separate permission check that could be forgotten on a new route.

### Registration is closed by default in production

```mermaid
flowchart LR
  SU["Sign-up attempt"] --> H["databaseHooks.user.create.before"]
  H --> Q{"ALLOWED_SIGNUP_EMAILS<br/>configured?"}
  Q -->|"unset"| OPEN["allow — fresh clones work"]
  Q -->|"set"| MATCH{"email on the list?"}
  MATCH -->|yes| CREATE["create user"]
  MATCH -->|no| DENY["403 · no row written"]

  style DENY fill:#fee2e2,stroke:#b91c1c
  style OPEN fill:#fef3c7,stroke:#b45309
```

The gate sits at the **user-insert boundary**, not on the sign-up endpoint — so
any auth method added later (a social provider, magic links) inherits it instead
of quietly bypassing it. There's no wildcard entry, and a listed bare domain does
not cover its addresses.

> ⚠️ **Unset means anyone can register.** On a public deployment that's an
> account that can spend your OpenRouter credit. Set `ALLOWED_SIGNUP_EMAILS`.

The AI rate limiter is a second layer for an account that already exists: an
in-process fixed-window counter on the two model-calling routes. It's a **spend
guard against a runaway client, not a security control** — see
[known limits](#design-notes-and-known-limits).

---

## Time zones

Serverless runtimes run in UTC. The model resolves every relative date you speak
against the date it's given, so a UTC clock puts late-night entries on the wrong
calendar day — and late-night braindumps are exactly the intended use.

```mermaid
flowchart LR
  subgraph b["Before"]
    direction TB
    B1["01:00 IST, 15 March"] --> B2["server UTC:<br/>19:30, 14 March"]
    B2 --> B3["'today' = the 14th ✗<br/>'yesterday' = the 13th ✗✗"]
  end

  subgraph a["Now"]
    direction TB
    A1["client sends<br/>Asia/Kolkata"] --> A2["today = 15 March ✓"]
    A2 --> A3["'yesterday' = the 14th ✓"]
  end

  style B3 fill:#fee2e2,stroke:#b91c1c
  style A3 fill:#dcfce7,stroke:#15803d
```

Resolution order: **client's IANA zone → `APP_TIMEZONE` → UTC**. The zone is sent
per request rather than captured at mount, so a laptop that travels dates facts
by where it is now. An invalid value falls back instead of failing the request —
a slightly wrong date beats a dropped health update.

---

## Code map

```
apps/
  server/    Fastify. Routes → service → repository (see "Inside the server").
             src/lib/system-prompt.ts   what the model knows
             src/lib/memory-tools.ts    what the model can change
             src/lib/time.ts            "today" in the user's zone
             src/lib/model.ts           model choice + prompt caching
             src/lib/import-hash.ts     import dedup key
             src/lib/rate-limit.ts      in-process spend guard
  web/       React 19 · Vite · TanStack Router · Tailwind 4.
             Chat pane (useChat + memory chips), memory rail
             (profile card + Trends sparklines + dated list), import page.
  native/    Expo. Same API and contracts. better-auth expo plugin keeps
             the session in SecureStore; every request attaches it manually.

packages/
  contracts/ Zod schemas shared by server, web and native — request/response
             shapes AND the memory-tool input/output contracts.
  db/        Drizzle schema, client, seed script.
  auth/      better-auth config + the sign-up allowlist predicate.
  env/       Validated env access (server: plain zod; web: t3-env + Vite).
  ui/        Shared shadcn/ui primitives + design tokens.
```

**Where a change lands.** Adding a field to a memory touches `packages/db`
(column) → `packages/contracts` (schema) → `memory-tools.ts` (tool input) →
`system-prompt.ts` (tell the model) → `health-repository.ts` (mapping) → the UI.
The contracts package is the hinge: server and both clients derive their types
from the same Zod schemas, so a mismatch is a build error rather than a runtime
surprise.

---

## Deployment

Two Vercel projects from one repo (`rootDirectory` per project):

- **caretalk-web** — static Vite build. `vercel.json` rewrites `/api/*` to the
  server project and everything else to `index.html` (SPA). The proxy is
  load-bearing for first-party cookies, as above.
- **caretalk-server** — a single serverless function. esbuild bundles the whole
  app (workspace packages included) into `api/index.mjs` at build time, so the
  runtime resolves no TS or workspace imports. `supportsResponseStreaming` keeps
  the SSE chat stream flowing instead of buffering it into one response.
- **Database** — Supabase Postgres via the **transaction pooler**
  (`aws-1-<region>.pooler.supabase.com:6543`). The direct `db.<ref>.supabase.co`
  host is IPv6-only and unreachable from Vercel. Migrations (`db:push`) run from
  a dev machine against the direct URL.

---

## Environment

`apps/server/.env`:

```bash
DATABASE_URL=            # local Postgres for dev; Supabase pooler URL in prod
BETTER_AUTH_SECRET=      # 32+ chars
BETTER_AUTH_URL=         # the origin the BROWSER sees (frontend domain in prod)
CORS_ORIGIN=             # web app origin
OPENROUTER_API_KEY=      # chat + import stop with a clean 503 without it
AI_MODEL=                # OpenRouter slug, e.g. anthropic/claude-sonnet-4.5

# Access. UNSET MEANS ANYONE CAN REGISTER — on a public deployment that's
# anyone spending your OpenRouter credit. Set it.
ALLOWED_SIGNUP_EMAILS=you@example.com

# Dates. Fallback for when the client can't send its own zone. Wrong value =
# every relative date the model resolves lands wrong for late-night entries.
APP_TIMEZONE=Asia/Kolkata

# Optional
AI_CHAT_MODEL=           # defaults to AI_MODEL
AI_IMPORT_MODEL=         # defaults to AI_MODEL
AI_CHAT_REASONING_EFFORT=# xhigh/high/medium/low/minimal/none; optional
AI_PROMPT_CACHE=true     # Anthropic caching via OpenRouter; ignored elsewhere
AI_RATE_LIMIT=60         # model-calling requests per user per window
AI_RATE_LIMIT_WINDOW_MS=3600000
```

`apps/web/.env`: `VITE_SERVER_URL` — `http://localhost:3000` in dev; the
frontend's own origin in prod (requests go through the proxy).

---

## Local development

```bash
pnpm install
pnpm db:up                      # Postgres 16 on localhost:5434
pnpm db:push                    # apply schema (needs DATABASE_URL)
pnpm dev:server                 # Fastify on :3000
pnpm dev:web                    # Vite on :3001

# optional demo data (after signing up once through the UI):
SEED_USER_EMAIL=you@example.com pnpm -F @caretalk/db seed
```

Local development uses `postgresql://postgres:dev@localhost:5434/caretalk_dev`.
The database lives in the named Docker volume `medimemory_pg_data`; `pnpm
db:down` stops and removes the container/network but retains that volume.

---

## Tests and evals

```bash
pnpm test        # pure units: prompt assembly, date/zone, allowlist, hashing, rate limit
pnpm test:db     # + supersession and chat persistence against Postgres
pnpm eval        # + memory-policy evals against the real model (costs money, needs a key)
```

```mermaid
flowchart LR
  U["<b>pnpm test</b><br/>no network, no DB<br/>~300ms"] --> D["<b>pnpm test:db</b><br/>real transactions<br/>real Postgres"]
  D --> E["<b>pnpm eval</b><br/>real prompt<br/>real model<br/>~40s, costs money"]

  style U fill:#dcfce7,stroke:#15803d
  style D fill:#fef3c7,stroke:#b45309
  style E fill:#ede9fe,stroke:#7c3aed
```

**The evals are the point.** Accumulate-vs-supersede, *"save the fact, not the
question"*, and relative-date resolution are enforced by **prompt text alone**.
Nothing in the type system or the schema stops the model from superseding a lab
result and quietly ending a series.

`src/evals/memory-policy.eval.test.ts` runs the real system prompt and the real
tool descriptions — imported, not paraphrased — against the real model, and
asserts on the tool **calls** rather than on prose. Run it after any edit to the
system prompt, a tool description, or `AI_MODEL`.

Current cases: a new reading must not supersede; a dose change must; blood
pressure must split into two values; a pure knowledge question must write
nothing; a message carrying both a fact and a question must save only the fact;
*"yesterday"* must resolve in the user's zone.

Two rules for working with them:

1. **A failing eval means behaviour changed.** Decide whether you want the new
   behaviour — don't reflexively loosen the assertion.
2. **Cases must be unambiguous.** One early case asked *"what does a hemoglobin
   of 11.6 mean?"* while 11.2 was stored, and flapped — correctly, since reading
   11.6 as a newly reported value is perfectly defensible. It was testing the
   model's coin-flip, not the policy. A flaky eval is worse than no eval, because
   it teaches you to ignore red.

The Postgres suite covers what a mock can't: that supersession is genuinely
atomic, that a cross-workspace `supersedesId` is refused, and that a colliding
client message id never overwrites another session's message.

---

## Design notes and known limits

- **Prompt tokens grow linearly with active memory count** (full injection). Fine
  for years at this scale; the pressure valve later is moving *old* memories
  behind a search tool, not RAG-ing the core list.
- **The model can forget to save** — agentic memory's known weakness. Chips make
  misses visible; *"tell it again"* is the failure mode, silent corruption is not.
- **Undoing a memory chip doesn't revert a profile rewrite from the same turn** —
  but the profile keeps its own history, so the rewrite is recoverable from the
  rail's *History*.
- **Long documents push against the serverless `maxDuration`.** Bodies beyond
  ~60k chars and 50+-fact imports are best split.
- **The AI rate limit is an in-process counter**, so on Vercel the real ceiling is
  `AI_RATE_LIMIT × warm instances`. It's a spend guard against a runaway client,
  not a security control — `ALLOWED_SIGNUP_EMAILS` is what keeps strangers out.
  Swap the Map for one Postgres row per `(key, window)` if a shared ceiling ever
  matters more than zero latency.
- **Trends are only as complete as the model's tagging.** `content` stays
  authoritative; an untagged reading is invisible to Trends but never lost.
- **Import dedup is keyed on a hash of title + text + file bytes.** A re-scan of
  the same page produces different bytes and correctly counts as a new document.
