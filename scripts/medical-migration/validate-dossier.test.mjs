import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { validateDossier } from "./validate-dossier.mjs";

async function dossierFixture() {
  const root = await mkdtemp(path.join(tmpdir(), "medical-dossier-"));
  await mkdir(path.join(root, "import"));
  await writeFile(path.join(root, "current-profile.md"), "# Current profile\nActive treatment.\n");
  await writeFile(path.join(root, "timeline.md"), "# Timeline\n2026-01-01 - Event.\n");
  await writeFile(
    path.join(root, "source-index.md"),
    "# Sources\n## SRC-RPT-001\n- Attachment ID: file_known\n",
  );
  await writeFile(path.join(root, "needs-review.md"), "# Needs review\nNone.\n");
  await writeFile(
    path.join(root, "evidence-ledger.jsonl"),
    `${JSON.stringify({ id: "EVT-0001", sourceId: "file_known", importable: true })}\n`,
  );
  await writeFile(path.join(root, "import", "001-diagnosis.md"), "# Diagnosis\nConfirmed fact.\n");
  return root;
}

test("accepts a complete sequential dossier", async () => {
  const result = await validateDossier(await dossierFixture());
  assert.equal(result.valid, true, result.errors.join("\n"));
  assert.equal(result.summary.chunkCount, 1);
});

test("rejects a chunk over 50000 characters", async () => {
  const root = await dossierFixture();
  await writeFile(path.join(root, "import", "001-diagnosis.md"), "x".repeat(50_001));
  const result = await validateDossier(root);
  assert.match(result.errors.join("\n"), /50000/);
});

test("rejects non-sequential import filenames", async () => {
  const root = await dossierFixture();
  await writeFile(path.join(root, "import", "003-follow-up.md"), "# Follow-up\nFact.\n");
  const result = await validateDossier(root);
  assert.match(result.errors.join("\n"), /sequential/);
});

test("rejects review markers inside import chunks", async () => {
  const root = await dossierFixture();
  await writeFile(path.join(root, "import", "001-diagnosis.md"), "# Diagnosis\nNeeds review.\n");
  const result = await validateDossier(root);
  assert.match(result.errors.join("\n"), /review-only marker/);
});

test("rejects attachment ids absent from source-index", async () => {
  const root = await dossierFixture();
  await writeFile(
    path.join(root, "evidence-ledger.jsonl"),
    `${JSON.stringify({ id: "EVT-0001", sourceId: "file_unknown", importable: true })}\n`,
  );
  const result = await validateDossier(root);
  assert.match(result.errors.join("\n"), /file_unknown/);
});

test("rejects an empty current profile or timeline", async () => {
  const root = await dossierFixture();
  await writeFile(path.join(root, "current-profile.md"), "\n");
  await writeFile(path.join(root, "timeline.md"), "\n");
  const result = await validateDossier(root);
  assert.match(result.errors.join("\n"), /current-profile\.md/);
  assert.match(result.errors.join("\n"), /timeline\.md/);
});
