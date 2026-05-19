import fastifyCors from "@fastify/cors";
import { auth } from "@health-conversation/auth";
import { env } from "@health-conversation/env/server";
import { ZodError } from "zod";
import Fastify from "fastify";

import { HttpError } from "./lib/http-error";
import { healthMemoryRoutes } from "./routes/health-memory";

const baseCorsConfig = {
  origin: env.CORS_ORIGIN,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  credentials: true,
  maxAge: 86400,
};

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
  fastify.log.error({ err: error }, "Unhandled server error");
  reply.status(500).send({ error: "Internal server error", code: "INTERNAL_SERVER_ERROR" });
});

fastify.register(fastifyCors, baseCorsConfig);
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
      const response = await auth.handler(req);
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

fastify.listen({ port: 3000 }, (err) => {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
  console.log("Server running on port 3000");
});
