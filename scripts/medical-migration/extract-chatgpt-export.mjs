import { createHash } from "node:crypto";
import { access, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function textFromMessage(message) {
  const parts = message.content?.parts ?? [];
  return parts
    .flatMap((part) => {
      if (typeof part === "string") return [part];
      if (part && typeof part === "object" && typeof part.text === "string") return [part.text];
      return [];
    })
    .join("\n");
}

function canonicalNodes(conversation) {
  const nodes = [];
  const seen = new Set();
  let nodeId = conversation.current_node;

  while (nodeId !== null && nodeId !== undefined) {
    if (seen.has(nodeId)) throw new Error(`Cycle in canonical chain at node: ${nodeId}`);
    seen.add(nodeId);

    const node = conversation.mapping?.[nodeId];
    if (!node) throw new Error(`Canonical node missing from mapping: ${nodeId}`);
    nodes.push(node);
    nodeId = node.parent;
  }

  return nodes.reverse();
}

function serializeMessage(node) {
  const message = node.message;
  const attachments = message.metadata?.attachments ?? [];
  return {
    messageId: message.id ?? node.id,
    parentId: node.parent ?? null,
    role: message.author?.role ?? "system",
    createdAt: message.create_time ?? null,
    text: textFromMessage(message),
    attachmentIds: attachments.map((attachment) => attachment.id).filter(Boolean),
  };
}

export async function extractConversation({ conversationFile, conversationId, exportDir }) {
  const conversations = JSON.parse(await readFile(conversationFile, "utf8"));
  const conversation = conversations.find((item) => item.conversation_id === conversationId);
  if (!conversation) throw new Error(`Conversation not found: ${conversationId}`);

  const nodes = canonicalNodes(conversation);
  const messageNodes = nodes.filter((node) => node.message !== null && node.message !== undefined);
  const messages = messageNodes.map(serializeMessage);
  const attachmentMap = new Map();

  for (const node of messageNodes) {
    const messageId = node.message.id ?? node.id;
    for (const attachment of node.message.metadata?.attachments ?? []) {
      if (!attachment.id) continue;
      const existing = attachmentMap.get(attachment.id);
      if (existing) {
        if (!existing.messageIds.includes(messageId)) existing.messageIds.push(messageId);
        continue;
      }

      const candidate = path.join(exportDir, `${attachment.id}.dat`);
      const found = await fileExists(candidate);
      const details = found ? await stat(candidate) : null;
      attachmentMap.set(attachment.id, {
        id: attachment.id,
        name: attachment.name ?? attachment.id,
        mimeType: attachment.mime_type ?? "application/octet-stream",
        messageIds: [messageId],
        payloadPath: found ? candidate : null,
        bytes: details?.size ?? null,
        status: found ? "found" : "missing",
      });
    }
  }

  const attachments = [...attachmentMap.values()].sort((a, b) => a.id.localeCompare(b.id));
  const manifest = {
    conversationId: conversation.conversation_id,
    title: conversation.title,
    currentNode: conversation.current_node,
    createTime: conversation.create_time ?? null,
    updateTime: conversation.update_time ?? null,
    canonicalNodeCount: nodes.length,
    canonicalMessageCount: messages.length,
    attachmentCount: attachments.length,
    foundAttachmentCount: attachments.filter((item) => item.status === "found").length,
    missingAttachmentCount: attachments.filter((item) => item.status === "missing").length,
    textCharacters: messages.reduce((total, message) => total + message.text.length, 0),
  };

  return { manifest, messages, attachments };
}

function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag?.startsWith("--") || value === undefined) {
      throw new Error(`Invalid CLI arguments near: ${flag ?? "(end)"}`);
    }
    values.set(flag.slice(2), value);
  }

  const required = ["conversation-file", "conversation-id", "export-dir", "output-dir"];
  for (const name of required) {
    if (!values.has(name)) throw new Error(`Missing required argument: --${name}`);
  }
  return Object.fromEntries(values);
}

async function sha256(filePath) {
  const contents = await readFile(filePath);
  return createHash("sha256").update(contents).digest("hex");
}

async function runCli() {
  const args = parseArguments(process.argv.slice(2));
  const conversationFile = path.resolve(args["conversation-file"]);
  const result = await extractConversation({
    conversationFile,
    conversationId: args["conversation-id"],
    exportDir: path.resolve(args["export-dir"]),
  });
  const outputDir = path.resolve(args["output-dir"]);
  await mkdir(outputDir, { recursive: true });

  result.manifest.conversationFile = conversationFile;
  result.manifest.conversationFileSha256 = await sha256(conversationFile);
  await writeFile(
    path.join(outputDir, "manifest.json"),
    `${JSON.stringify(result.manifest, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    path.join(outputDir, "attachments.json"),
    `${JSON.stringify(result.attachments, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    path.join(outputDir, "canonical-messages.jsonl"),
    `${result.messages.map((message) => JSON.stringify(message)).join("\n")}\n`,
    "utf8",
  );

  process.stdout.write(`${JSON.stringify(result.manifest, null, 2)}\n`);
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  runCli().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
