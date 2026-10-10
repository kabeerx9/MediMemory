import { mcpResourceUrl } from "@caretalk/auth";
import { connectionsResponseSchema } from "@caretalk/contracts/health";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { getRequiredUserId } from "../lib/auth";
import { notFound } from "../lib/http-error";
import { connectionsRepository } from "../repositories/connections-repository";

// The web app's view of external AI apps: what's connected, and a real
// disconnect (see connections-repository for why not better-auth's own).
export const connectionRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/api/v1/connections", async (request) => {
    const userId = await getRequiredUserId(request);
    return connectionsResponseSchema.parse({
      mcpUrl: mcpResourceUrl,
      connections: await connectionsRepository.listConnections(userId),
    });
  });

  fastify.delete("/api/v1/connections/:clientId", async (request) => {
    const userId = await getRequiredUserId(request);
    const { clientId } = z.object({ clientId: z.string().min(1).max(500) }).parse(request.params);
    if (!(await connectionsRepository.disconnect(userId, clientId))) throw notFound("Connection not found");
    return { ok: true };
  });
};
