import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().min(1),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    CORS_ORIGIN: z.url(),
    OPENROUTER_API_KEY: z.string().min(1).optional(),
    // OpenRouter model slug (provider/model). The chat model makes the
    // save/supersede memory decisions, so default to a strong one.
    AI_MODEL: z.string().min(1).default("anthropic/claude-sonnet-4.5"),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
