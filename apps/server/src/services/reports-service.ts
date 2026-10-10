import { createHash, randomBytes, randomUUID } from "node:crypto";

import { env } from "@caretalk/env/server";

import { EXTENSION_FOR, sanitizeFileName, sniffMediaType } from "../lib/file-type";
import { fileStore, type FileStore } from "../lib/file-store";
import { HttpError, notFound } from "../lib/http-error";
import { healthRepository } from "../repositories/health-repository";
import { reportsRepository } from "../repositories/reports-repository";

// Long enough to find the file on a phone and tap upload; short enough that a
// link pasted somewhere it shouldn't be goes dead on its own.
export const UPLOAD_LINK_TTL_MS = 30 * 60 * 1000;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

function requireStore(store: FileStore | null): FileStore {
  if (!store) {
    throw new HttpError(
      503,
      "File storage isn't configured on this server, so originals can't be kept here yet.",
      "FILE_STORAGE_DISABLED",
    );
  }
  return store;
}

/** The rules every original must pass, whichever way it arrives. */
export function validateFile(bytes: Uint8Array) {
  if (bytes.length === 0) throw new HttpError(400, "The file is empty.", "EMPTY_FILE");
  if (bytes.length > env.MAX_UPLOAD_BYTES) {
    throw new HttpError(413, `Files can be up to ${Math.floor(env.MAX_UPLOAD_BYTES / 1024 / 1024)} MB.`, "FILE_TOO_LARGE");
  }
  const mediaType = sniffMediaType(bytes);
  if (!mediaType) {
    throw new HttpError(415, "Only PDF and photo files (JPEG, PNG, WebP, HEIC) can be attached.", "UNSUPPORTED_FILE_TYPE");
  }
  return mediaType;
}

/**
 * Validates and persists one original. Shared by every way a file arrives
 * (upload link, logged-in attach, import), so the rules can't diverge: size
 * cap, type sniffed from bytes, sha256 recorded, never overwrite.
 */
async function storeFile(
  input: { workspaceId: string; sourceId: string; bytes: Uint8Array; fileName?: string | null },
  store: FileStore,
) {
  const mediaType = validateFile(input.bytes);
  const id = randomUUID();
  const storageKey = `${input.workspaceId}/${id}`;
  await store.put(storageKey, input.bytes);
  try {
    return await reportsRepository.insertFile({
      id,
      workspaceId: input.workspaceId,
      sourceId: input.sourceId,
      fileName: sanitizeFileName(input.fileName, `report.${EXTENSION_FOR[mediaType]}`),
      mediaType,
      sizeBytes: input.bytes.length,
      sha256: createHash("sha256").update(input.bytes).digest("hex"),
      storageKey,
    });
  } catch (error) {
    // No row means nothing will ever reference these bytes.
    await store.remove(storageKey).catch(() => undefined);
    throw error;
  }
}

export function createReportsService(store: FileStore | null) {
  return {
    fileStorageEnabled: store !== null,

    async listReports(userId: string, workspaceId: string) {
      await healthRepository.getWorkspace(userId, workspaceId);
      return { reports: await reportsRepository.listReports(workspaceId), fileStorageEnabled: store !== null };
    },

    /** Mints a one-time link for attaching a report's original from any browser. */
    async createUploadLink(workspaceId: string, sourceId: string, publicOrigin: string, now = new Date()) {
      const token = randomBytes(32).toString("base64url");
      const expiresAt = new Date(now.getTime() + UPLOAD_LINK_TTL_MS);
      await reportsRepository.createUploadLink({ tokenHash: hashToken(token), workspaceId, sourceId, expiresAt });
      return { url: new URL(`/upload/${token}`, publicOrigin).toString(), expiresAt: expiresAt.toISOString() };
    },

    async getUploadLinkInfo(token: string, now = new Date()) {
      const found = await reportsRepository.findUploadLink(hashToken(token));
      // Same 404 for "never existed" and "wrong token": nothing to enumerate.
      if (!found) throw notFound("This upload link doesn't exist.");
      const { link } = found;
      return {
        status: link.usedAt ? "used" : link.expiresAt <= now ? "expired" : "ready",
        reportTitle: found.reportTitle,
        workspaceName: found.workspaceName,
        expiresAt: link.expiresAt.toISOString(),
        maxBytes: env.MAX_UPLOAD_BYTES,
      } as const;
    },

    /**
     * Spends a link and stores the file. Validation runs before the claim so
     * a wrong file type doesn't burn the link; storage failure after the
     * claim releases it so the user can retry.
     */
    async uploadWithLink(token: string, bytes: Uint8Array, fileName?: string | null) {
      const activeStore = requireStore(store);
      const tokenHash = hashToken(token);
      const found = await reportsRepository.findUploadLink(tokenHash);
      if (!found) throw notFound("This upload link doesn't exist.");

      validateFile(bytes);

      const claimed = await reportsRepository.claimUploadLink(tokenHash);
      if (!claimed) {
        throw new HttpError(410, "This upload link was already used or has expired. Ask for a new one.", "UPLOAD_LINK_SPENT");
      }
      try {
        return await storeFile({ workspaceId: claimed.workspaceId, sourceId: claimed.sourceId, bytes, fileName }, activeStore);
      } catch (error) {
        await reportsRepository.releaseUploadLink(tokenHash);
        throw error;
      }
    },

    /** Logged-in attach from the web app. */
    async attachFile(userId: string, workspaceId: string, sourceId: string, bytes: Uint8Array, fileName?: string | null) {
      const activeStore = requireStore(store);
      await healthRepository.getWorkspace(userId, workspaceId);
      await reportsRepository.getSource(workspaceId, sourceId);
      return storeFile({ workspaceId, sourceId, bytes, fileName }, activeStore);
    },

    /**
     * Keeps an imported document's original. Best effort by design: the
     * import already ran and its facts are saved, so a storage problem must
     * not turn that success into an error.
     */
    async retainImportFile(workspaceId: string, sourceId: string, bytes: Uint8Array, fileName: string) {
      if (!store) return null;
      try {
        return await storeFile({ workspaceId, sourceId, bytes, fileName }, store);
      } catch (error) {
        console.error("Failed to retain imported file", { workspaceId, sourceId, error });
        return null;
      }
    },

    async readFile(userId: string, workspaceId: string, fileId: string) {
      const activeStore = requireStore(store);
      await healthRepository.getWorkspace(userId, workspaceId);
      const file = await reportsRepository.getFile(workspaceId, fileId);
      return { file, bytes: await activeStore.read(file.storageKey) };
    },
  };
}

export const reportsService = createReportsService(fileStore);
