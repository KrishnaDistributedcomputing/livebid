import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  SESSION_COOKIE_NAME: z.string().min(1).default("livebid_session"),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(24 * 30).default(168),
  APP_ORIGIN: z.string().url().default("http://localhost:3000"),
});

let parsedEnv: z.infer<typeof envSchema> | undefined;

export function getEnv() {
  parsedEnv ??= envSchema.parse({
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL: process.env.DATABASE_URL,
    REDIS_URL: process.env.REDIS_URL,
    SESSION_COOKIE_NAME: process.env.SESSION_COOKIE_NAME,
    SESSION_TTL_HOURS: process.env.SESSION_TTL_HOURS,
    APP_ORIGIN: process.env.APP_ORIGIN,
  });
  return parsedEnv;
}
