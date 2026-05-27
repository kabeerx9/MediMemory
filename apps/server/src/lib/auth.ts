import { auth } from "@caretalk/auth";
import type { FastifyRequest } from "fastify";

import { unauthorized } from "./http-error";

export async function getRequiredUserId(request: FastifyRequest): Promise<string> {
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item);
    } else if (value !== undefined) {
      headers.append(key, String(value));
    }
  }

  const session = await auth.api.getSession({ headers });
  if (!session?.user?.id) {
    throw unauthorized();
  }

  return session.user.id;
}
