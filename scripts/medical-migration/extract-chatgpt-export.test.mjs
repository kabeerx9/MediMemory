import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const moduleUrl = pathToFileURL(
  path.join(import.meta.dirname, "extract-chatgpt-export.mjs"),
).href;

async function loadExtractor() {
  return import(moduleUrl);
}

function message({ id, parent, role, text, attachments = [] }) {
  return {
    id,
    parent,
    children: [],
    message: {
      id,
      author: { role },
      create_time: 1_700_000_000,
      content: { content_type: "text", parts: [text] },
      metadata: { attachments },
    },
  };
}

function conversationFixture() {
  return {
    title: "Papa medical analysis",
    conversation_id: "conversation-1",
    create_time: 1_700_000_000,
    update_time: 1_700_000_500,
    current_node: "canonical-leaf",
    mapping: {
      root: { id: "root", parent: null, children: ["user-1"], message: null },
      "user-1": message({ id: "user-1", parent: "root", role: "user", text: "  Exact text  " }),
      "canonical-leaf": message({
        id: "canonical-leaf",
        parent: "user-1",
        role: "assistant",
        text: "Canonical answer",
        attachments: [
          { id: "file-present", name: "report.pdf", mime_type: "application/pdf" },
          { id: "file-missing", name: "missing.pdf", mime_type: "application/pdf" },
        ],
      }),
      abandoned: message({
        id: "abandoned",
        parent: "user-1",
        role: "assistant",
        text: "Regenerated answer that must not be exported",
        attachments: [
          { id: "file-present", name: "report.pdf", mime_type: "application/pdf" },
        ],
      }),
    },
  };
}

async function arrangeExport() {
  const root = await mkdtemp(path.join(tmpdir(), "caretalk-chat-export-"));
  const exportDir = path.join(root, "export");
  await mkdir(exportDir);
  const conversationFile = path.join(exportDir, "conversations.json");
  await writeFile(conversationFile, JSON.stringify([conversationFixture()]), "utf8");
  await writeFile(path.join(exportDir, "file-present.dat"), "report bytes", "utf8");
  return { root, exportDir, conversationFile };
}

test("follows current_node parents and excludes abandoned branches", async () => {
  const { extractConversation } = await loadExtractor();
  const { exportDir, conversationFile } = await arrangeExport();

  const result = await extractConversation({
    conversationFile,
    conversationId: "conversation-1",
    exportDir,
  });

  assert.deepEqual(
    result.messages.map((item) => item.messageId),
    ["user-1", "canonical-leaf"],
  );
  assert.equal(result.messages.some((item) => item.messageId === "abandoned"), false);
});

test("serializes message text without normalizing its content", async () => {
  const { extractConversation } = await loadExtractor();
  const { exportDir, conversationFile } = await arrangeExport();

  const result = await extractConversation({
    conversationFile,
    conversationId: "conversation-1",
    exportDir,
  });

  assert.equal(result.messages[0].text, "  Exact text  ");
  assert.equal(result.messages[1].text, "Canonical answer");
});

test("deduplicates attachments by id and resolves id-based payloads", async () => {
  const { extractConversation } = await loadExtractor();
  const { exportDir, conversationFile } = await arrangeExport();

  const result = await extractConversation({
    conversationFile,
    conversationId: "conversation-1",
    exportDir,
  });

  const present = result.attachments.find((item) => item.id === "file-present");
  assert.equal(result.attachments.filter((item) => item.id === "file-present").length, 1);
  assert.equal(present.status, "found");
  assert.equal(present.bytes, 12);
  assert.equal(await readFile(present.payloadPath, "utf8"), "report bytes");
});

test("marks referenced payloads missing instead of inventing a path", async () => {
  const { extractConversation } = await loadExtractor();
  const { exportDir, conversationFile } = await arrangeExport();

  const result = await extractConversation({
    conversationFile,
    conversationId: "conversation-1",
    exportDir,
  });

  const missing = result.attachments.find((item) => item.id === "file-missing");
  assert.equal(missing.status, "missing");
  assert.equal(missing.payloadPath, null);
  assert.equal(missing.bytes, null);
});

test("fails when the requested conversation id is absent", async () => {
  const { extractConversation } = await loadExtractor();
  const { exportDir, conversationFile } = await arrangeExport();

  await assert.rejects(
    extractConversation({ conversationFile, conversationId: "unknown", exportDir }),
    /Conversation not found: unknown/,
  );
});
