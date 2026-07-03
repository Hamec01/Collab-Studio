import { z } from "zod";

const usernameSchema = z
  .string()
  .trim()
  .min(3, "Username must be at least 3 characters")
  .max(40, "Username must be at most 40 characters")
  .regex(/^[a-zA-Z0-9._-]+$/, "Username may contain only letters, numbers, dots, underscores, and hyphens")
  .transform((value) => value.toLowerCase());

const emailSchema = z
  .string()
  .trim()
  .email("Email must be valid")
  .max(254, "Email must be at most 254 characters")
  .transform((value) => value.toLowerCase());

export const passwordSchema = z
  .string()
  .min(12, "Password must be at least 12 characters")
  .max(128, "Password must be at most 128 characters");

export const registerSchema = z.object({
  username: usernameSchema,
  email: z.preprocess((value) => (value === "" ? undefined : value), emailSchema.optional()),
  displayName: z.string().trim().min(1, "Display name is required").max(120, "Display name must be at most 120 characters"),
  password: passwordSchema,
  ageAcknowledged: z.literal(true),
});

export const emailVerificationRequestSchema = z.object({
  email: emailSchema,
});

export const verifyEmailSchema = z.object({
  token: z.string().trim().min(20).max(256),
});

export const passwordResetRequestSchema = z.object({
  email: emailSchema,
});

export const passwordResetSchema = z.object({
  token: z.string().trim().min(20).max(256),
  password: passwordSchema,
});

export const loginSchema = z
  .object({
    login: z.string().trim().max(254).optional(),
    username: z.string().trim().max(254).optional(),
    email: z.string().trim().max(254).optional(),
    password: z.string().min(1, "Password is required").max(128, "Password must be at most 128 characters"),
  })
  .transform((value, ctx) => {
    const login = value.login ?? value.username ?? value.email;
    if (!login) {
      ctx.addIssue({ code: "custom", message: "Username or email is required", path: ["login"] });
      return z.NEVER;
    }
    return {
      login: login.trim().toLowerCase(),
      password: value.password,
    };
  });

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
