import type { FastifyReply, FastifyRequest } from "fastify";

// Fastify <-> Fetch API bridge. better-auth and the MCP SDK both speak
// web-standard Request/Response; Fastify speaks node streams. Everything that
// crosses that boundary goes through these two functions so header/body
// handling can't drift between the auth routes, discovery routes, and /api/mcp.

/**
 * Rebuilds the incoming request as a web Request. Bodies are re-serialized
 * from what Fastify parsed: JSON objects back to JSON, and the raw string for
 * form-encoded bodies (OAuth token requests are form-encoded, and re-encoding
 * them as JSON would break client authentication).
 */
export function toWebRequest(request: FastifyRequest, pathOverride?: string): Request {
  const url = new URL(pathOverride ?? request.url, `http://${request.headers.host ?? "localhost"}`);
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item);
    } else if (value !== undefined) {
      headers.append(key, String(value));
    }
  }

  let body: string | undefined;
  if (request.method !== "GET" && request.method !== "HEAD" && request.body !== undefined && request.body !== null) {
    body = typeof request.body === "string" ? request.body : JSON.stringify(request.body);
    // The original content-length described the original bytes; a
    // re-serialized body can differ, and undici rejects a mismatch.
    headers.delete("content-length");
  }

  return new Request(url.toString(), { method: request.method, headers, body });
}

/**
 * Writes a web Response through Fastify. Streams are piped rather than
 * buffered so an MCP response that upgrades to SSE still flows incrementally.
 */
export async function sendWebResponse(reply: FastifyReply, response: Response) {
  reply.status(response.status);
  response.headers.forEach((value, key) => {
    // Node recomputes these for the bytes it actually writes. Set-Cookie is
    // written once below: forEach yields each cookie separately and Fastify
    // appends, so handling it here too sent every cookie twice.
    if (key === "content-length" || key === "transfer-encoding" || key === "set-cookie") return;
    reply.header(key, value);
  });
  // getSetCookie keeps multiple Set-Cookie headers separate; forEach would
  // have joined them with a comma, which browsers parse as one broken cookie.
  const cookies = response.headers.getSetCookie();
  if (cookies.length > 0) reply.header("set-cookie", cookies);

  if (!response.body) return reply.send(null);
  if ((response.headers.get("content-type") ?? "").includes("text/event-stream")) {
    return reply.send(response.body);
  }
  return reply.send(Buffer.from(await response.arrayBuffer()));
}
