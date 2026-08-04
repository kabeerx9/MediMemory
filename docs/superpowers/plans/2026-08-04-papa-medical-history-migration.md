# Papa Medical History Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a private, evidence-backed dossier and chronological MediMemory import chunks from the canonical `Papa medical analysis` ChatGPT export.

**Architecture:** A deterministic local extractor reconstructs the canonical ChatGPT branch and resolves attachment payloads without changing the export. Report evidence and user-authored events are normalized into a local evidence ledger; reviewed ledger entries generate a current profile, human timeline, audit index, uncertainty queue, and clinical-episode import chunks. Medical outputs remain under a git-ignored local directory and enter MediMemory only through its existing Profile and Import interfaces.

**Tech Stack:** Node.js ESM, `node:test`, ChatGPT export JSON, Poppler (`pdfinfo`, `pdftotext`, `pdftoppm`), Markdown, MediMemory web Import UI.

## Global Constraints

- Treat original reports as primary evidence, dated user statements as secondary evidence, and prior ChatGPT responses only as leads.
- Read only the canonical parent chain ending at the conversation's `current_node`; exclude abandoned and regenerated branches.
- Preserve the original ChatGPT export byte-for-byte.
- Store all medical inputs and derived outputs under `/local-health-data/`, which must be git-ignored.
- Do not commit medical data, patient identifiers, report contents, derived facts, or migration outputs.
- Do not commit project changes unless the user explicitly asks.
- Do not import unresolved claims or the audit/review files into MediMemory.
- Keep each import chunk at or below 50,000 characters.
- Import chronologically through MediMemory's existing UI; do not write directly to Postgres.

---

## File map

### Tracked migration tooling

- Modify: `.gitignore` - excludes the local medical-data root.
- Create: `scripts/medical-migration/extract-chatgpt-export.mjs` - reconstructs the canonical conversation and resolves attachment payloads.
- Create: `scripts/medical-migration/extract-chatgpt-export.test.mjs` - tests canonical-branch selection, message serialization, and attachment resolution against synthetic data.
- Create: `scripts/medical-migration/validate-dossier.mjs` - validates deliverables, import ordering, character limits, review-marker isolation, and source coverage.
- Create: `scripts/medical-migration/validate-dossier.test.mjs` - tests valid and invalid dossier fixtures.

### Git-ignored medical workspace

- Create: `local-health-data/papa-medical-analysis/extracted/manifest.json`
- Create: `local-health-data/papa-medical-analysis/extracted/canonical-messages.jsonl`
- Create: `local-health-data/papa-medical-analysis/extracted/attachments.json`
- Create: `local-health-data/papa-medical-analysis/reports/<attachment-id>/`
- Create: `local-health-data/papa-medical-analysis/evidence-ledger.jsonl`
- Create: `local-health-data/papa-medical-analysis/current-profile.md`
- Create: `local-health-data/papa-medical-analysis/timeline.md`
- Create: `local-health-data/papa-medical-analysis/source-index.md`
- Create: `local-health-data/papa-medical-analysis/needs-review.md`
- Create: `local-health-data/papa-medical-analysis/import/NNN-<episode>.md`

The two extractor files are the decision-bearing tooling worth reviewing first. The dossier validator is mechanical. Medical outputs are private review artifacts and never belong in Git.

---

### Task 1: Establish the local privacy boundary

**Files:**
- Modify: `.gitignore`
- Create: `local-health-data/papa-medical-analysis/`

**Interfaces:**
- Consumes: repository root.
- Produces: a local output directory that `git check-ignore` confirms is excluded.

- [ ] **Step 1: Add the medical-data root to `.gitignore`**

Append this scoped rule:

```gitignore
# Local medical migrations - contains private health information
/local-health-data/
```

- [ ] **Step 2: Create the dossier directories**

Run:

```bash
mkdir -p local-health-data/papa-medical-analysis/extracted
mkdir -p local-health-data/papa-medical-analysis/reports
mkdir -p local-health-data/papa-medical-analysis/import
```

- [ ] **Step 3: Verify Git cannot see the medical workspace**

Run:

```bash
git check-ignore -v local-health-data/papa-medical-analysis
git status --short
```

Expected: the first command cites the new `.gitignore` rule; `git status` does not list `local-health-data`.

---

### Task 2: Build the canonical export extractor with tests

**Files:**
- Create: `scripts/medical-migration/extract-chatgpt-export.test.mjs`
- Create: `scripts/medical-migration/extract-chatgpt-export.mjs`

**Interfaces:**
- Consumes: `extractConversation({ conversationFile, conversationId, exportDir })`.
- Produces: `{ manifest, messages, attachments }`, where messages are canonical-chain records and attachments include `payloadPath` plus `status: "found" | "missing"`.
- CLI: `node scripts/medical-migration/extract-chatgpt-export.mjs --conversation-file <json> --conversation-id <id> --export-dir <dir> --output-dir <dir>`.

- [ ] **Step 1: Write failing synthetic-fixture tests**

Cover these exact behaviors with `node:test`:

```js
test("follows current_node parents and excludes abandoned branches", () => {});
test("serializes text without evaluating or normalizing medical content", () => {});
test("deduplicates attachments by id and resolves <id>.dat payloads", () => {});
test("marks referenced payloads missing instead of inventing a path", () => {});
test("fails when the requested conversation id is absent", () => {});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run:

```bash
node --test scripts/medical-migration/extract-chatgpt-export.test.mjs
```

Expected: failure because the extractor module does not exist.

- [ ] **Step 3: Implement the extractor**

Use this record contract:

```js
// canonical-messages.jsonl
{
  messageId: String,
  parentId: String | null,
  role: "user" | "assistant" | "system" | "tool",
  createdAt: Number | null,
  text: String,
  attachmentIds: Array<String>
}

// attachments.json item
{
  id: String,
  name: String,
  mimeType: String,
  messageIds: Array<String>,
  payloadPath: String | null,
  bytes: Number | null,
  status: "found" | "missing"
}
```

The module must export `extractConversation` for tests and run the CLI only when invoked directly. The CLI creates its output directory, writes pretty JSON for `manifest.json` and `attachments.json`, and writes one JSON object per line for `canonical-messages.jsonl`.

- [ ] **Step 4: Run extractor tests**

Run:

```bash
node --test scripts/medical-migration/extract-chatgpt-export.test.mjs
```

Expected: all five behaviors pass.

- [ ] **Step 5: Review without committing**

Run:

```bash
git diff --check
git status --short
```

Expected: the extractor and test are unstaged; no medical outputs appear.

---

### Task 3: Extract the canonical conversation and attachment inventory

**Files:**
- Create: `local-health-data/papa-medical-analysis/extracted/manifest.json`
- Create: `local-health-data/papa-medical-analysis/extracted/canonical-messages.jsonl`
- Create: `local-health-data/papa-medical-analysis/extracted/attachments.json`

**Interfaces:**
- Consumes: ChatGPT export directory, `conversations-012.json`, and conversation ID `6948e1c3-2ed4-832e-9105-813d82e814be`.
- Produces: deterministic private extraction artifacts used by every later task.

- [ ] **Step 1: Run the extractor against the real export**

Run the CLI with:

```text
conversation file: /Users/kabeer/Downloads/7cbb87c4538e11f049804121f1a141629cdd626d7e5663354ac26717f7e56ad6-2026-08-03-07-51-59-0148abc440c44334a3cac334a092da74/conversations-012.json
conversation id: 6948e1c3-2ed4-832e-9105-813d82e814be
export directory: /Users/kabeer/Downloads/7cbb87c4538e11f049804121f1a141629cdd626d7e5663354ac26717f7e56ad6-2026-08-03-07-51-59-0148abc440c44334a3cac334a092da74
output directory: local-health-data/papa-medical-analysis/extracted
```

- [ ] **Step 2: Check extraction invariants**

Expected manifest values:

```json
{
  "conversationId": "6948e1c3-2ed4-832e-9105-813d82e814be",
  "title": "Papa medical analysis",
  "canonicalMessageCount": 2176,
  "attachmentCount": 21
}
```

The directly resolved payload count is expected to start at 14. Any change must be explained by successful recovery, not silently accepted.

- [ ] **Step 3: Confirm the export is unchanged**

Record SHA-256 hashes for `conversations-012.json` and the export ZIP in `manifest.json` before any recovery work. Recompute after extraction and require an exact match.

---

### Task 4: Recover and inspect every available report

**Files:**
- Create: `local-health-data/papa-medical-analysis/reports/<attachment-id>/metadata.json`
- Create: `local-health-data/papa-medical-analysis/reports/<attachment-id>/extracted.txt`
- Create: `local-health-data/papa-medical-analysis/reports/<attachment-id>/pages/page-N.png`
- Create: `local-health-data/papa-medical-analysis/source-index.md`
- Create: `local-health-data/papa-medical-analysis/needs-review.md`

**Interfaces:**
- Consumes: `attachments.json` and resolved payloads.
- Produces: visually verified report evidence and an explicit missing-source queue.

- [ ] **Step 1: Classify each attachment**

For every attachment, record ID, original name, MIME type, referenced message timestamp, payload status, byte size, SHA-256, and whether it is a duplicate payload. Never deduplicate by filename alone.

- [ ] **Step 2: Attempt deterministic recovery for missing payloads**

Search `library_files.json`, export JSON metadata, and export filenames for each missing attachment ID and original name. Accept a recovered payload only when the metadata or checksum establishes the mapping. Otherwise keep `status: missing`.

- [ ] **Step 3: Extract and render PDFs**

For each available PDF, run:

```bash
pdfinfo <payload> > <report-dir>/pdfinfo.txt
pdftotext -layout <payload> <report-dir>/extracted.txt
pdftoppm -png <payload> <report-dir>/pages/page
```

For images, preserve the payload and inspect it at original detail. For plain text, preserve exact UTF-8 text.

- [ ] **Step 4: Inspect all pages visually**

Read every relevant page, including tables, impressions, footnotes, reference ranges, units, and handwritten annotations. Do not rely on OCR/text extraction alone. Record illegible or contradictory material in `needs-review.md`.

- [ ] **Step 5: Build the report source index**

Each `source-index.md` entry must contain:

```markdown
## SRC-RPT-NNN - Original filename
- Attachment ID:
- Document/report date:
- Discussed in ChatGPT on:
- Type:
- Payload status: available | missing
- SHA-256:
- Pages inspected:
- Timeline evidence IDs:
- Notes:
```

---

### Task 5: Build and review the evidence ledger

**Files:**
- Create: `local-health-data/papa-medical-analysis/evidence-ledger.jsonl`
- Update: `local-health-data/papa-medical-analysis/source-index.md`
- Update: `local-health-data/papa-medical-analysis/needs-review.md`

**Interfaces:**
- Consumes: verified report evidence and canonical conversation messages.
- Produces: normalized evidence records used as the sole input to dossier generation.

- [ ] **Step 1: Add report-backed records first**

Use this schema for every JSONL record:

```js
{
  id: "EVT-NNNN",
  eventDate: "YYYY-MM-DD" | "YYYY-MM" | null,
  datePrecision: "day" | "month" | "approximate" | "unknown",
  recordedAt: "ISO-8601" | null,
  category: "diagnosis" | "report" | "measurement" | "treatment" | "medication" | "procedure" | "symptom" | "appointment" | "decision" | "other",
  fact: String,
  sourceType: "report" | "user-message",
  sourceId: String,
  sourceLocator: String,
  confidence: "confirmed" | "user-reported" | "uncertain",
  importable: Boolean,
  reviewReason: String | null
}
```

- [ ] **Step 2: Add durable user-reported events**

Read user messages chronologically. Retain diagnoses, treatments, medication changes, significant or recurring symptoms, clinician decisions, and future care. Exclude filler, repeated questions, general medical discussion, and isolated minor symptoms with no consequence.

- [ ] **Step 3: Use assistant messages only as a coverage check**

Search assistant responses for dates, report names, medications, and procedures absent from the ledger. Promote a lead only after locating report or user support. Unsupported leads go to `needs-review.md`, not the ledger as importable facts.

- [ ] **Step 4: Deduplicate and represent change over time**

Keep repeated measurements as separate events. Collapse repeated prose about the same unchanged fact. Preserve medication/treatment state changes as distinct dated events so MediMemory can supersede old state without erasing history.

- [ ] **Step 5: Review all uncertain records**

Every `confidence: "uncertain"` record must set `importable: false` and have a non-empty `reviewReason`. Add the question and evidence references to `needs-review.md`.

---

### Task 6: Build the dossier and import chunks

**Files:**
- Create: `local-health-data/papa-medical-analysis/current-profile.md`
- Create: `local-health-data/papa-medical-analysis/timeline.md`
- Update: `local-health-data/papa-medical-analysis/source-index.md`
- Update: `local-health-data/papa-medical-analysis/needs-review.md`
- Create: `local-health-data/papa-medical-analysis/import/NNN-<episode>.md`

**Interfaces:**
- Consumes: reviewed `evidence-ledger.jsonl` only.
- Produces: human review artifacts and MediMemory-ready content.

- [ ] **Step 1: Write the current profile**

Keep it under 30 lines and include only the latest supported diagnosis, current treatment/medications, latest clinical status, major active risks, and next planned care. Do not include historical states that are no longer current.

- [ ] **Step 2: Write the full timeline**

Order by clinical event date, then recorded date. Every entry includes its evidence ID and source ID. Separate confirmed facts, user-reported facts, and unresolved items visibly.

- [ ] **Step 3: Partition importable facts by clinical episode**

Create sequential files starting at `001`. Prefer episode boundaries such as diagnosis/workup, treatment start, interim assessment, procedure/admission, and follow-up rather than arbitrary character cuts.

Each chunk starts with:

```markdown
# Papa medical history - <episode title>

This is a curated factual timeline. Save each durable fact separately with its stated date. Do not save source labels, evidence IDs, uncertainty notes, or these instructions as health facts.
```

Only records with `importable: true` enter these files. Each fact is self-contained and includes its clinical date and relevant units.

- [ ] **Step 4: Keep audit and uncertainty material out of import chunks**

Search every file under `import/` for `uncertain`, `needs review`, `missing report`, and review-only evidence IDs. Any match must be inspected and removed unless it is part of a confirmed factual phrase.

---

### Task 7: Build and run the dossier validator

**Files:**
- Create: `scripts/medical-migration/validate-dossier.test.mjs`
- Create: `scripts/medical-migration/validate-dossier.mjs`

**Interfaces:**
- Consumes: `validateDossier(rootDirectory)`.
- Produces: `{ valid, errors, warnings, summary }` and a non-zero CLI exit code when invalid.
- CLI: `node scripts/medical-migration/validate-dossier.mjs local-health-data/papa-medical-analysis`.

- [ ] **Step 1: Write failing validator tests**

Cover:

```js
test("accepts a complete sequential dossier", () => {});
test("rejects a chunk over 50000 characters", () => {});
test("rejects non-sequential import filenames", () => {});
test("rejects review markers inside import chunks", () => {});
test("rejects attachment ids absent from source-index", () => {});
test("rejects an empty current profile or timeline", () => {});
```

- [ ] **Step 2: Run tests and confirm failure**

Run:

```bash
node --test scripts/medical-migration/validate-dossier.test.mjs
```

Expected: failure because the validator does not exist.

- [ ] **Step 3: Implement the validator and CLI**

Return all errors in one run rather than stopping at the first. The summary must report attachment coverage, ledger record count, importable record count, review count, chunk count, and maximum chunk size.

- [ ] **Step 4: Run unit tests and real validation**

Run:

```bash
node --test scripts/medical-migration/*.test.mjs
node scripts/medical-migration/validate-dossier.mjs local-health-data/papa-medical-analysis
git diff --check
git status --short
```

Expected: all tests pass, real validation returns `valid: true`, medical outputs remain hidden from Git, and tracked tooling/design files remain unstaged.

---

### Task 8: User review and staged MediMemory import

**Files:**
- Review: `local-health-data/papa-medical-analysis/current-profile.md`
- Review: `local-health-data/papa-medical-analysis/timeline.md`
- Review: `local-health-data/papa-medical-analysis/source-index.md`
- Review: `local-health-data/papa-medical-analysis/needs-review.md`
- Review: `local-health-data/papa-medical-analysis/import/*.md`

**Interfaces:**
- Consumes: validated dossier plus user corrections.
- Produces: a populated MediMemory workspace whose profile and memory rail agree with the reviewed dossier.

- [ ] **Step 1: Review decision-bearing artifacts in order**

Review `needs-review.md`, then `current-profile.md`, then `timeline.md`, then `source-index.md`. Resolve user-answerable questions and regenerate affected import chunks before importing.

- [ ] **Step 2: Paste the current profile**

Use the workspace Profile editor and save the reviewed contents of `current-profile.md`.

- [ ] **Step 3: Import chunks oldest to newest**

For each file, use its filename as the Import title, paste the body, and wait for extraction to finish. Do not use "Import anyway" on duplicate warnings without reconciling why the hash matched.

- [ ] **Step 4: Review writes after every chunk**

Compare the returned fact list against that chunk. Correct or delete inaccurate memories immediately; do not proceed with accumulated errors.

- [ ] **Step 5: Run final application-level verification**

Compare the memory rail to `timeline.md`, then ask the workspace chat about:

- the original diagnosis and supporting report;
- the sequence of major treatments and changes;
- important measurement/report trends;
- the latest supported status; and
- the next planned care.

Answers must be grounded in the imported memory and agree with the dossier. Any mismatch is corrected in memory before the migration is declared complete.
