import {
  fileParamsSchema,
  reportParamsSchema,
  reportsResponseSchema,
  sourceFileSchema,
  uploadLinkInfoSchema,
  uploadTokenParamsSchema,
  workspaceParamsSchema,
} from "@caretalk/contracts/health";
import { env } from "@caretalk/env/server";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";

import { getRequiredUserId } from "../lib/auth";
import { RateLimiter } from "../lib/rate-limit";
import { HttpError } from "../lib/http-error";
import { reportsService } from "../services/reports-service";

// Report originals. Uploads are the raw file as the request body (the browser
// sends a File directly), not multipart: one file per request is all any
// caller needs, and it keeps the parser to a single Buffer.


// The token is 256 bits, so this isn't about guessing; it caps how much a
// single client can push through the public upload endpoint.
const uploadLimiter = new RateLimiter(30, 10 * 60 * 1000);

function headerFileName(request: FastifyRequest): string | null {
  const raw = request.headers["x-file-name"];
  if (typeof raw !== "string") return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function bodyBytes(request: FastifyRequest): Uint8Array {
  if (!Buffer.isBuffer(request.body)) {
    throw new HttpError(415, "Send the file itself as the request body.", "UNSUPPORTED_FILE_TYPE");
  }
  return request.body;
}

export const reportRoutes: FastifyPluginAsync = async (fastify) => {
  // Scoped to this plugin: the rest of the API stays JSON-only.
  const parserOptions = { parseAs: "buffer" as const, bodyLimit: env.MAX_UPLOAD_BYTES };
  const passThrough = (_request: FastifyRequest, body: Buffer | string, done: (error: null, body: Buffer | string) => void) =>
    done(null, body);
  fastify.addContentTypeParser(["application/pdf", "application/octet-stream"], parserOptions, passThrough);
  fastify.addContentTypeParser(/^image\//, parserOptions, passThrough);
  const fileRouteOptions = { bodyLimit: env.MAX_UPLOAD_BYTES };

  fastify.get("/api/v1/workspaces/:workspaceId/reports", async (request) => {
    const userId = await getRequiredUserId(request);
    const { workspaceId } = workspaceParamsSchema.parse(request.params);
    return reportsResponseSchema.parse(await reportsService.listReports(userId, workspaceId));
  });

  fastify.post("/api/v1/workspaces/:workspaceId/reports/:sourceId/files", fileRouteOptions, async (request) => {
    const userId = await getRequiredUserId(request);
    const { workspaceId, sourceId } = reportParamsSchema.parse(request.params);
    const file = await reportsService.attachFile(userId, workspaceId, sourceId, bodyBytes(request), headerFileName(request));
    return sourceFileSchema.parse(file);
  });

  fastify.get("/api/v1/workspaces/:workspaceId/files/:fileId", async (request, reply) => {
    const userId = await getRequiredUserId(request);
    const { workspaceId, fileId } = fileParamsSchema.parse(request.params);
    const { file, bytes } = await reportsService.readFile(userId, workspaceId, fileId);
    const download = (request.query as { download?: string } | undefined)?.download === "1";
    reply
      .type(file.mediaType)
      .header(
        "content-disposition",
        `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
      )
      // The type was sniffed on the way in; nosniff keeps the browser from
      // second-guessing it.
      .header("x-content-type-options", "nosniff")
      // Medical documents: never written to a (possibly shared) disk cache.
      .header("cache-control", "private, no-store");
    // Images get a locked-down CSP. PDFs can't: Chrome's viewer refuses to
    // render under `sandbox`, and the viewer is its own isolated context.
    if (file.mediaType.startsWith("image/")) {
      reply.header("content-security-policy", "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
    }
    return reply.send(bytes);
  });

  // Public: the token is the credential. Responses say nothing beyond what
  // the token holder needs to see on the page.
  fastify.get("/api/v1/uploads/:token", async (request) => {
    const { token } = uploadTokenParamsSchema.parse(request.params);
    return uploadLinkInfoSchema.parse(await reportsService.getUploadLinkInfo(token));
  });

  fastify.put("/api/v1/uploads/:token", fileRouteOptions, async (request) => {
    const limited = uploadLimiter.check(request.ip);
    if (!limited.allowed) {
      throw new HttpError(429, `Too many uploads — try again in ${limited.retryAfterSeconds}s.`, "RATE_LIMITED");
    }
    const { token } = uploadTokenParamsSchema.parse(request.params);
    const file = await reportsService.uploadWithLink(token, bodyBytes(request), headerFileName(request));
    return { ok: true, fileName: file.fileName, sizeBytes: file.sizeBytes };
  });
};
