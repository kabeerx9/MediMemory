import { auth, mcpResourceUrl } from "@caretalk/auth";
import { requireMcpAuth } from "@better-auth/mcp";
import type { FastifyPluginAsync } from "fastify";

import { mcpHttpHandler } from "../mcp/server";
import { sendWebResponse, toWebRequest } from "../lib/web-bridge";

// Remote MCP endpoint for external AI apps (Claude, ChatGPT, Hermes).
//
// Discovery, as the clients walk it:
//   1. POST /api/mcp without a token → 401 + WWW-Authenticate naming the
//      protected-resource metadata URL.
//   2. GET that metadata → "authorization_servers": [our issuer].
//   3. GET the issuer's authorization-server metadata → authorize/token/
//      register endpoints, all served by better-auth under /api/auth.
// Steps 2 and 3 live at the ORIGIN root (/.well-known/...), per RFC 9728 and
// RFC 8414, so they're forwarded into the auth handler from here.

const resourceMetadataUrl = new URL(
  `/.well-known/oauth-protected-resource${new URL(mcpResourceUrl).pathname}`,
  mcpResourceUrl,
).toString();

const protectedMcp = requireMcpAuth(
  auth,
  (request, claims) => mcpHttpHandler(request, claims, resourceMetadataUrl),
  { resource: mcpResourceUrl },
);

export const mcpRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post("/api/mcp", async (request, reply) => {
    return sendWebResponse(reply, await protectedMcp(toWebRequest(request)));
  });

  // Stateless server: there is no session to stream to or tear down.
  fastify.route({
    method: ["GET", "DELETE"],
    url: "/api/mcp",
    handler: async (_request, reply) => reply.status(405).header("allow", "POST").send(),
  });

  // Root-path variants (no issuer path appended) for clients written against
  // the 2025-03 spec, which looked for metadata at the bare origin. Aliased to
  // the issuer's own documents so every lookup returns the same metadata.
  const issuerPath = "/api/auth";
  const aliases: Record<string, string> = {
    "/.well-known/oauth-authorization-server": `${issuerPath}/.well-known/oauth-authorization-server`,
    "/.well-known/openid-configuration": `${issuerPath}/.well-known/openid-configuration`,
    [`/.well-known/openid-configuration${issuerPath}`]: `${issuerPath}/.well-known/openid-configuration`,
  };

  fastify.get("/.well-known/*", async (request, reply) => {
    const path = request.url.split("?")[0] ?? request.url;
    return sendWebResponse(reply, await auth.handler(toWebRequest(request, aliases[path])));
  });
};
