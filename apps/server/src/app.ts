import fastifyCors from "@fastify/cors";
import { auth } from "@caretalk/auth";
import { env } from "@caretalk/env/server";
import { ZodError } from "zod";
import Fastify from "fastify";

import { HttpError } from "./lib/http-error";
import { healthMemoryRoutes } from "./routes/health-memory";

// App assembly without listen(): the local entrypoint (index.ts) listens on a
// port; the Vercel entrypoint (api/index.ts) feeds requests in via the node
// server's request event instead.
export function buildApp() {
  const fastify = Fastify({ logger: true });

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
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    credentials: true,
    maxAge: 86400,
  });
  fastify.register(healthMemoryRoutes);

  fastify.route({
    method: ["GET", "POST"],
    url: "/api/auth/*",
    async handler(request, reply) {
      try {
        const url = new URL(request.url, "http://" + request.headers.host);
        const headers = new Headers();
        Object.entries(request.headers).forEach(([key, value]) => {
          if (value) headers.append(key, value.toString());
        });
        const req = new Request(url.toString(), {
          method: request.method,
          headers,
          body: request.body ? JSON.stringify(request.body) : undefined,
        });
        // Structural type: the web Response global resolves differently across
        // build environments (DOM lib vs undici); depend only on what we use.
        const response = (await auth.handler(req)) as {
          status: number;
          headers: { forEach(callback: (value: string, key: string) => void): void };
          body: unknown;
          text(): Promise<string>;
        };
        reply.status(response.status);
        response.headers.forEach((value, key) => reply.header(key, value));
        reply.send(response.body ? await response.text() : null);
      } catch (error) {
        fastify.log.error({ err: error }, "Authentication Error:");
        reply.status(500).send({ error: "Internal authentication error", code: "AUTH_FAILURE" });
      }
    },
  });

  fastify.get("/", async () => "OK");

  return fastify;
}
