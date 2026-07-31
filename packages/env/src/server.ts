import "dotenv/config";
import { z } from "zod";

// Plain zod instead of @t3-oss/env-core: t3-env's key-name template-literal
// types break under older TypeScript versions (Vercel's build toolchain), and
// for a server-only schema it adds nothing over a straight parse.
const schema = z.object({
  DATABASE_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url(),
  CORS_ORIGIN: z.url(),
  OPENROUTER_API_KEY: z.string().min(1).optional(),
  // OpenRouter model slug (provider/model). The chat model makes the
  // save/supersede memory decisions, so default to a strong one.
  AI_MODEL: z.string().min(1).default("anthropic/claude-sonnet-4.5"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

// Preserve t3-env's emptyStringAsUndefined behavior.
const raw = Object.fromEntries(
  Object.entries(process.env).filter(([, value]) => value !== ""),
);

export const env = schema.parse(raw);
