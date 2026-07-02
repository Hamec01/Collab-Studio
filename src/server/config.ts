import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const booleanFromEnv = (defaultValue: boolean) =>
  z.preprocess((value) => {
    if (value === undefined || value === null || value === "") return defaultValue;
    if (typeof value === "boolean") return value;
    if (typeof value === "string") return ["1", "true", "yes", "on"].includes(value.toLowerCase());
    return value;
  }, z.boolean());

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().max(65535).default(3000),
  APP_URL: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  SESSION_SECRET: z
    .string()
    .min(32, "SESSION_SECRET must be at least 32 characters")
    .refine((value) => !["change-me", "replace-me", "secret", "keyboard-cat", "replace-with-at-least-32-random-characters"].includes(value.toLowerCase()), {
      message: "SESSION_SECRET must not use a default or placeholder value",
    }),
  GEMINI_API_KEY: z.string().optional(),
  UPLOADS_DIR: z.string().min(1).default("./uploads"),
  ALLOW_PUBLIC_REGISTRATION: booleanFromEnv(false),
  TRUST_PROXY: booleanFromEnv(false),
  COOKIE_SECURE: booleanFromEnv(false),
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  GOOGLE_CALLBACK_URL: z.string().url().optional(),
});

export type AppConfig = z.infer<typeof envSchema>;

let cachedConfig: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (cachedConfig) return cachedConfig;

  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
    throw new Error(`Invalid environment configuration: ${details}`);
  }

  cachedConfig = parsed.data;
  return cachedConfig;
}
