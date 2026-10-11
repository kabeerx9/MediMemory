import fastifyCors from "@fastify/cors";
import { auth } from "@caretalk/auth";
import { env } from "@caretalk/env/server";
import { ZodError } from "zod";
import Fastify from "fastify";

import { HttpError } from "./lib/http-error";
import { sendWebResponse, toWebRequest } from "./lib/web-bridge";
import { healthMemoryRoutes } from "./routes/health-memory";
import { connectionRoutes } from "./routes/connections";
import { mcpRoutes } from "./routes/mcp";
import { reportRoutes } from "./routes/reports";
import { whoopRoutes } from "./routes/whoop";

// App assembly without listen(): the local entrypoint (index.ts) listens on a
// port; the Vercel entrypoint (api/index.ts) feeds requests in via the node
// server's request event instead.
export function buildApp() {
  // bodyLimit: Fastify defaults to 1MiB, which rejects import requests
  // carrying a base64 file. 8MiB gives headroom locally; on Vercel the
  // platform's own ~4.5MB request cap bites first.
  const fastify = Fastify({
    // Upload-link tokens are bearer credentials that ride in the URL; keep
    // them out of request logs.
    logger: {
      serializers: {
        req: (request) => ({
          method: request.method,
          url: request.url.replace(/(\/api\/v1\/uploads\/)[^/?#]+/, "$1[redacted]"),
          remoteAddress: request.ip,
        }),
      },
    },
    bodyLimit: 8 * 1024 * 1024,
  });

  fastify.setErrorHandler((error, _request, reply) => {
    if (error instanceof HttpError) {
      reply.status(error.statusCode).send({ error: error.message, code: error.code });
      return;
    }
    if (error instanceof ZodError) {
      reply.status(400).send({ error: "Invalid request", code: "VALIDATION_ERROR", issues: error.issues });
      return;
    }
    if (error && typeof error === "object" && "statusCode" in error) {
      const statusError = error as Error & { statusCode?: number; code?: string };
      if (typeof statusError.statusCode === "number" && statusError.statusCode >= 400 && statusError.statusCode < 500) {
        reply.status(statusError.statusCode).send({ error: statusError.message, code: statusError.code ?? "BAD_REQUEST" });
        return;
      }
    }
    fastify.log.error({ err: error }, "Unhandled server error");
    reply.status(500).send({ error: "Internal server error", code: "INTERNAL_SERVER_ERROR" });
  });

  fastify.register(fastifyCors, {
    origin: env.CORS_ORIGIN,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "X-File-Name"],
    credentials: true,
    maxAge: 86400,
  });
  fastify.register(healthMemoryRoutes);
  fastify.register(reportRoutes);
  fastify.register(connectionRoutes);
  fastify.register(whoopRoutes);

  // OAuth token, revocation, and (optionally) authorize requests are
  // form-encoded. Keep the raw string: better-auth parses it itself, and
  // client authentication depends on the exact parameters received.
  fastify.addContentTypeParser(
    "application/x-www-form-urlencoded",
    { parseAs: "string" },
    (_request, body, done) => done(null, body),
  );

  fastify.route({
    method: ["GET", "POST"],
    url: "/api/auth/*",
    async handler(request, reply) {
      try {
        return await sendWebResponse(reply, await auth.handler(toWebRequest(request)));
      } catch (error) {
        fastify.log.error({ err: error }, "Authentication Error:");
        reply.status(500).send({ error: "Internal authentication error", code: "AUTH_FAILURE" });
      }
    },
  });

  fastify.register(mcpRoutes);

  fastify.get("/", async () => "OK");

  return fastify;
}
