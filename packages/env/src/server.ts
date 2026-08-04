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
  // Per-path overrides, both falling back to AI_MODEL. Import is the
  // 120-step path over a whole document and is usually the cheaper job;
  // chat is where the accumulate-vs-supersede judgement happens.
  AI_CHAT_MODEL: z.string().min(1).optional(),
  AI_IMPORT_MODEL: z.string().min(1).optional(),
  AI_CHAT_REASONING_EFFORT: z
    .enum(["xhigh", "high", "medium", "low", "minimal", "none"])
    .optional(),
  // Anthropic prompt caching through OpenRouter. The system prompt carries the
  // whole active memory list and is re-sent every turn; caching it is the
  // single biggest lever on cost. Ignored for non-Anthropic models.
  AI_PROMPT_CACHE: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  // IANA zone used to resolve "today"/"yesterday" for the model when the client
  // doesn't send its own. Serverless runtimes are UTC, which silently shifts
  // every date the model writes for users east of Greenwich.
  APP_TIMEZONE: z.string().min(1).default("UTC"),
  // Comma-separated email allowlist for sign-up. Unset = open registration,
  // which on a public deployment means anyone can create an account and spend
  // your OpenRouter credit.
  ALLOWED_SIGNUP_EMAILS: z.string().optional(),
  // Per-user cap on model-calling requests (chat + import), per window. This is
  // a spend guard, not a security control.
  AI_RATE_LIMIT: z.coerce.number().int().positive().default(60),
  AI_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60 * 60 * 1000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

// Preserve t3-env's emptyStringAsUndefined behavior.
const raw = Object.fromEntries(
  Object.entries(process.env).filter(([, value]) => value !== ""),
);

export const env = schema.parse(raw);
