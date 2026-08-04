import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const MAX_CHUNK_CHARACTERS = 50_000;
const REVIEW_MARKERS = [/\bneeds review\b/i, /\bmissing report\b/i, /\breview-only\b/i];

async function readText(filePath, errors, label = path.basename(filePath)) {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    errors.push(`${label} is missing or unreadable: ${error.message}`);
    return "";
  }
}

function parseLedger(text, errors) {
  const records = [];
  for (const [index, line] of text.split("\n").entries()) {
    if (!line.trim()) continue;
    try {
      records.push(JSON.parse(line));
    } catch (error) {
      errors.push(`evidence-ledger.jsonl line ${index + 1} is invalid JSON: ${error.message}`);
    }
  }
  return records;
}

export async function validateDossier(rootDirectory) {
  const root = path.resolve(rootDirectory);
  const errors = [];
  const warnings = [];
  const required = {};

  for (const name of [
    "current-profile.md",
    "timeline.md",
    "source-index.md",
    "needs-review.md",
    "evidence-ledger.jsonl",
  ]) {
    required[name] = await readText(path.join(root, name), errors, name);
  }

  for (const name of ["current-profile.md", "timeline.md"]) {
    if (!required[name].trim()) errors.push(`${name} must not be empty`);
  }

  const sourceIndex = required["source-index.md"];
  const indexedAttachmentIds = new Set(
    [...sourceIndex.matchAll(/^- Attachment ID:\s*(\S+)\s*$/gm)].map((match) => match[1]),
  );
  const ledger = parseLedger(required["evidence-ledger.jsonl"], errors);
  for (const record of ledger) {
    if (
      typeof record.sourceId === "string" &&
      record.sourceId.startsWith("file_") &&
      !indexedAttachmentIds.has(record.sourceId)
    ) {
      errors.push(`Ledger attachment ${record.sourceId} is absent from source-index.md`);
    }
  }

  let chunkNames = [];
  try {
    chunkNames = (await readdir(path.join(root, "import")))
      .filter((name) => name.endsWith(".md"))
      .sort();
  } catch (error) {
    errors.push(`import directory is missing or unreadable: ${error.message}`);
  }

  let maximumChunkSize = 0;
  for (const [index, name] of chunkNames.entries()) {
    const expectedPrefix = String(index + 1).padStart(3, "0");
    if (!name.startsWith(`${expectedPrefix}-`)) {
      errors.push(`Import filenames must be sequential from 001; found ${name} at position ${index + 1}`);
    }
    const contents = await readText(path.join(root, "import", name), errors, `import/${name}`);
    maximumChunkSize = Math.max(maximumChunkSize, contents.length);
    if (contents.length > MAX_CHUNK_CHARACTERS) {
      errors.push(`import/${name} exceeds 50000 characters (${contents.length})`);
    }
    for (const marker of REVIEW_MARKERS) {
      if (marker.test(contents)) {
        errors.push(`import/${name} contains review-only marker ${marker}`);
      }
    }
  }
  if (chunkNames.length === 0) errors.push("At least one sequential import chunk is required");

  let attachmentCount = indexedAttachmentIds.size;
  try {
    const attachments = JSON.parse(
      await readFile(path.join(root, "extracted", "attachments.json"), "utf8"),
    );
    attachmentCount = attachments.length;
    for (const attachment of attachments) {
      if (!indexedAttachmentIds.has(attachment.id)) {
        errors.push(`Extracted attachment ${attachment.id} is absent from source-index.md`);
      }
    }
  } catch (error) {
    warnings.push(`Could not compare extracted attachment inventory: ${error.message}`);
  }

  const summary = {
    attachmentCount,
    indexedAttachmentCount: indexedAttachmentIds.size,
    ledgerRecordCount: ledger.length,
    importableRecordCount: ledger.filter((record) => record.importable === true).length,
    reviewCount: ledger.filter(
      (record) => record.importable === false || record.confidence === "uncertain",
    ).length,
    chunkCount: chunkNames.length,
    maximumChunkSize,
  };
  return { valid: errors.length === 0, errors, warnings, summary };
}

async function runCli() {
  const root = process.argv[2];
  if (!root) throw new Error("Usage: node validate-dossier.mjs <dossier-root>");
  const result = await validateDossier(root);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.valid) process.exitCode = 1;
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  runCli().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
