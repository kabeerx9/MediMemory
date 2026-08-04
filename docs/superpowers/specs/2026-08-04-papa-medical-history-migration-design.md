# Papa Medical History Migration Design

## Goal

Convert the canonical ChatGPT conversation titled `Papa medical analysis` and its available report attachments into a concise, evidence-backed health history that can be reviewed before being imported into one MediMemory workspace.

The migration must preserve the meaningful clinical timeline from December 2025 onward without treating repeated discussion, temporary noise, or prior ChatGPT interpretations as authoritative medical facts.

## Source boundary

The source export remains unchanged. Extraction uses only:

- the canonical parent chain ending at conversation node `99223803-222b-48ab-8f54-9314dc4df69f`;
- user-authored messages on that chain;
- report attachments referenced by messages on that chain; and
- assistant messages only as leads for locating dates, documents, and claims that must be confirmed elsewhere.

Abandoned branches and regenerated responses are excluded. The source conversation contains 2,176 canonical messages and approximately 2.46 million text characters. It references 21 attachments; 14 attachment payloads are directly present under their expected export IDs and seven require recovery or explicit missing-source treatment.

## Evidence policy

Evidence is ranked in this order:

1. Original report, prescription, discharge document, or scan.
2. A dated user statement describing an event or a doctor's statement.
3. An undated user statement that can be placed only approximately.
4. A prior ChatGPT response, used only to find a claim and never as the sole source of a medical fact.

Conflicts are not silently resolved. Both claims are recorded in `needs-review.md`, and the import material includes only the supported claim or explicitly labels the uncertainty.

Each retained fact records an event date when known, an approximate date marker when exact dating is impossible, and a source reference. This keeps clinical event time distinct from the later date on which the event was discussed.

## Inclusion and exclusion rules

Retain:

- diagnosis, stage, pathology, and clinically meaningful disease status;
- report findings, laboratory values, imaging findings, and trends;
- procedures, admissions, treatment cycles, and significant complications;
- medication starts, stops, dose changes, and treatment-plan changes;
- persistent, recurrent, severe, or treatment-relevant symptoms;
- clinician decisions, referrals, planned follow-ups, and upcoming appointments; and
- facts needed to understand why a later decision or event occurred.

Exclude:

- repeated copies or paraphrases of an already-supported fact;
- general medical explanations and prior assistant speculation;
- questions that do not themselves contain durable facts;
- reassurance, conversational filler, and administrative chatter with no clinical consequence; and
- isolated minor symptoms that resolved quickly and caused no medical contact, treatment change, recurrence, or later clinical consequence.

An apparently minor symptom is retained when the surrounding context raises its importance, including during chemotherapy or immunosuppression, when it prompted clinician contact, when it interrupted treatment, or when it later became part of a recurring pattern.

## Deliverables

Medical outputs are written to a local git-ignored directory and must never be committed:

- `current-profile.md`: the current diagnosis, treatment, status, major risks, and next planned care. This is manually reviewed before being pasted into MediMemory's editable Profile.
- `timeline.md`: the complete human-reviewable chronology, including source labels and uncertainty markers.
- `source-index.md`: attachment and conversation-source inventory, recovery status, report dates, and the timeline sections supported by each source.
- `needs-review.md`: missing sources, ambiguous dates, conflicting claims, and facts requiring user confirmation.
- `import/NNN-<episode>.md`: chronological, deduplicated import batches, each no more than 50,000 characters and scoped to a coherent clinical episode.

The dossier is the audit artifact. Only `current-profile.md` and files under `import/` are intended to enter MediMemory.

## Extraction workflow

1. Resolve the canonical message chain and generate a metadata-only message and attachment index.
2. Recover attachment payloads from the export where possible and mark unrecoverable files without guessing their contents.
3. Read each available report completely. Extract text for search, render pages for visual verification, and capture material headings, dates, values, findings, and conclusions.
4. Build a report-first chronology.
5. Add supported user-reported events and treatment context from the conversation.
6. Remove duplicates and exclude low-value temporary events under the inclusion policy.
7. Separate the latest current state into `current-profile.md`.
8. Record conflicts and uncertainty instead of smoothing them into a single narrative.
9. Produce clinical-episode import chunks, oldest first.
10. Run structural checks for size, date ordering, source coverage, duplicate facts, and unresolved placeholders.

## MediMemory import procedure

Import is deliberately staged rather than written directly to the database:

1. Create or select the workspace for the user's father.
2. Paste the reviewed `current-profile.md` into the workspace Profile.
3. In the Import screen, paste `import/001-...md` and use its filename as the import title.
4. Review every memory MediMemory says it saved. Correct or delete inaccurate entries before proceeding.
5. Repeat in numerical order through the final chunk.
6. Compare the resulting memory rail and current profile against `timeline.md`.
7. Ask several verification questions covering diagnosis, treatment changes, report trends, and the next planned care.

`source-index.md` and `needs-review.md` are not imported because audit metadata and unresolved claims should not become clinical memory.

## Safety and privacy

- The ChatGPT export is read-only and remains the recovery source.
- Medical dossier files are stored only in a git-ignored local directory.
- No health data, patient name, report content, or derived timeline is committed.
- No direct database writes are used for migration.
- Prior model analysis is never promoted to fact without report or user support.
- Missing reports remain explicitly missing; their contents are not reconstructed from assistant summaries.

## Verification and completion criteria

The dossier is ready for user review when:

- every canonical attachment has a source-index entry;
- every available report has been fully inspected and visually checked;
- every retained timeline event has a source and date or uncertainty marker;
- no import chunk exceeds 50,000 characters;
- chunks are chronologically ordered and do not repeat the same fact;
- `current-profile.md` agrees with the latest supported timeline state;
- all conflicting or unsupported claims appear in `needs-review.md`; and
- automated scans find no unfinished markers or placeholder sections.

The migration is complete only after the user reviews the dossier and the staged MediMemory imports have been checked against it.
