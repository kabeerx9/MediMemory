export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code = "HTTP_ERROR",
  ) {
    super(message);
  }
}

export function notFound(message = "Not found") {
  return new HttpError(404, message, "NOT_FOUND");
}

export function unauthorized(message = "Unauthorized") {
  return new HttpError(401, message, "UNAUTHORIZED");
}

export function badRequest(message = "Bad request") {
  return new HttpError(400, message, "BAD_REQUEST");
}
