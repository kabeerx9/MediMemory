import type { IncomingMessage, ServerResponse } from "node:http";

import { buildApp } from "./app";

// Vercel serverless entrypoint. Bundled to api/index.mjs at build time
// (vercel.json buildCommand) so the runtime never resolves workspace TS
// imports. All paths rewrite to this function with the original URL intact.
const app = buildApp();

// bodyParser off: Fastify needs the raw request stream for its own parsing.
// supportsResponseStreaming on: without it Vercel buffers the whole SSE chat
// response until the function returns — the client sees nothing, then a burst.
export const config = { api: { bodyParser: false }, supportsResponseStreaming: true };
export const supportsResponseStreaming = true;

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  await app.ready();
  app.server.emit("request", req, res);
}
