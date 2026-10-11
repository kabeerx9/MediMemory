# Hermes Tracker → Caretalk (piece 3a)

**Goal:** Hermes's health_tracker stops using its own SQLite file (`~/.hermes/data/health/health.db`) and stores everything in Caretalk's Postgres instead. The CLI, the skill rules and the reports stay as they are; only the storage layer underneath changes.

**Decisions:**
- **Write path:** keep the CLI and swap its storage.
- **Workouts:** move to Caretalk too.
- **Steps:** come from WHOOP.

## Caretalk
- **Tables** (all scoped to a workspace): `tracker_checkins`, `tracker_checkin_state`, `workout_logs`, `workout_plans`, `api_tokens`.
- **Dashboard rows:** every confirmed check-in also writes a `daily_metrics` row with `source = 'hermes'` (calories, weight, exercised, steps).
- **API tokens:**
  - Created from the Connections page (shown once; only a sha256 hash is stored), listed there, and revocable.
  - Each token is bound to one workspace.
  - Sent as `Authorization: Bearer ct_…`.
- **Tracker API** at `/api/tracker/v1/*`, mirroring the `HealthStore` methods:

| Method + path | Does | Returns |
|---|---|---|
| `POST /checkins/:date/start` | Opens the night's check-in | `prompt` \| `already_confirmed` |
| `POST /checkins/:date/reminder` | Asks whether a reminder is due | `{ remind }` |
| `PUT /checkins/:date` | Saves a confirmed check-in, upserting the state to confirmed | `created` \| `updated` |
| `GET /checkins/:date` | Reads one check-in | the check-in |
| `GET /checkins?from&to` | Reads a range | list of check-ins |
| `PUT /workouts/:date` | Writes a workout log (the merge and validation rules stay in Python; the server stores the row) | — |
| `GET /workouts?from&to` | Reads workout logs in a range | list of logs |
| `PUT /plans/:id` | Stores a canonical payload, idempotent | `saved` \| `already_saved`, or 409 if the payload differs |
| `GET /plans/:id` | Reads one plan | the plan |
| `GET /plans/active?asOf` | Reads the plan in force on that date | the plan |

- **Timestamps:** the client may send `at` (ISO), which keeps test clocks and the migration's original timestamps.
- **Validation:** the server re-checks the same ranges as Python (calories 0–15000, steps 0–200000, weight 20.0–400.0 kg, note ≤500, workout note ≤300 / details ≤2000).

## Hermes
- **`CaretalkStore`** in `health_tracker/caretalk_store.py`, with the same public methods as `HealthStore`.
  - Workout merge rules, the history fingerprint and plan validation reuse the existing Python code.
  - Reports fill a check-in's empty `steps` from WHOOP rows (via `/api/v1/daily-metrics`).
- **Store selection:** `cli._store()` uses `CaretalkStore` when `~/.hermes/data/health/caretalk.json` exists (`{ "base_url", "token" }`, chmod 600); otherwise SQLite.
- **Contract tests:** `test_caretalk_store.py` runs the store contract against a live Caretalk when `CARETALK_TEST_URL`/`CARETALK_TEST_TOKEN` are set.
- **Migration:** `migrate_to_caretalk.py` copies health.db into Caretalk, keeping the original timestamps, with `--dry-run` and a final count check.
- **Cutover:**
  - write the config
  - update AGENTS.md and MEMORY.md, and the stale "no subscription wearables" line in USER.md
  - repoint the data-vault backup at a Caretalk export
  - disable `health_backup` and the Caretalk weekly sync
  - keep health.db as a read-only archive

## Dashboard
- Tiles: calories, and weight (7-day average).
- Charts: calories and weight.
- Workout logs on the timeline.
