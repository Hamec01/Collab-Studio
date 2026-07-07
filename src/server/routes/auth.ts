import argon2 from "argon2";
import { randomBytes } from "node:crypto";
import { Router, type NextFunction, type Request, type Response } from "express";
import { OAuth2Client } from "google-auth-library";
import { Prisma } from "@prisma/client";
import { getConfig } from "../config";
import { prisma } from "../db";
import { requireAuth } from "../middleware/auth";
import { AppError, sendError } from "../middleware/errors";
import { authRateLimit } from "../middleware/rateLimits";
import {
  emailVerificationRequestSchema,
  loginSchema,
  passwordResetRequestSchema,
  passwordResetSchema,
  registerSchema,
  verifyEmailSchema,
} from "../schemas/auth";
import { hashOpaqueToken, newOpaqueToken } from "../services/stage3Access";
import { safeUserSelect, serializeUser } from "../services/users";
import { getSessionCookieOptions } from "../session";

const genericLoginError = "Invalid username/email or password";
const googleScopes = ["openid", "email", "profile"] as const;
const googleIssuerSet = new Set(["accounts.google.com", "https://accounts.google.com"]);
const router = Router();

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;
const asyncHandler = (handler: AsyncHandler) => (req: Request, res: Response, next: NextFunction) => {
  handler(req, res, next).catch(next);
};

function regenerateSession(req: Request) {
  return new Promise<void>((resolve, reject) => {
    req.session.regenerate((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function saveSession(req: Request) {
  return new Promise<void>((resolve, reject) => {
    req.session.save((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function destroySession(req: Request) {
  return new Promise<void>((resolve, reject) => {
    req.session.destroy((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function isGoogleOAuthConfigured(config = getConfig()) {
  return Boolean(config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET && config.GOOGLE_CALLBACK_URL);
}

function getGoogleClient(config = getConfig()) {
  if (!config.GOOGLE_CLIENT_ID || !config.GOOGLE_CLIENT_SECRET || !config.GOOGLE_CALLBACK_URL) {
    throw new AppError(503, "google_not_configured", "Google login is not configured");
  }

  return new OAuth2Client(config.GOOGLE_CLIENT_ID, config.GOOGLE_CLIENT_SECRET, config.GOOGLE_CALLBACK_URL);
}

function getAppRedirectUrl(config = getConfig(), authError?: string) {
  const redirectUrl = new URL("/", config.APP_URL);
  if (authError) redirectUrl.searchParams.set("authError", authError);
  return redirectUrl.toString();
}

function redirectAuthError(res: Response, code: string) {
  const config = getConfig();
  res.redirect(302, getAppRedirectUrl(config, code));
}

function readString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

async function issueEmailVerificationToken(userId: string) {
  const token = newOpaqueToken();
  const tokenHash = hashOpaqueToken(token);
  await prisma.emailVerificationToken.create({
    data: {
      userId,
      tokenHash,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
    },
  });
  return token;
}

async function issuePasswordResetToken(userId: string) {
  const token = newOpaqueToken();
  const tokenHash = hashOpaqueToken(token);
  await prisma.passwordResetToken.create({
    data: {
      userId,
      tokenHash,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
    },
  });
  return token;
}

function sanitizeUsernameSeed(value: string) {
  const normalized = value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "");

  return normalized.slice(0, 32) || "google-user";
}

async function generateUniqueUsername(tx: Prisma.TransactionClient, seed: string) {
  const base = sanitizeUsernameSeed(seed);

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const suffix = attempt === 0 ? "" : `-${randomBytes(2).toString("hex")}`;
    const candidate = `${base}${suffix}`.slice(0, 40).replace(/[._-]+$/g, "") || "google-user";
    const existing = await tx.user.findFirst({ where: { username: candidate }, select: { id: true } });
    if (!existing) return candidate;
  }

  throw new AppError(409, "google_username_conflict", "Unable to generate a unique username");
}

async function clearGoogleSessionState(req: Request) {
  req.session.googleOAuthState = undefined;
  req.session.googleOAuthMode = undefined;
  await saveSession(req).catch(() => undefined);
}

router.get(
  "/providers",
  asyncHandler(async (_req, res) => {
    res.json({ googleOAuthEnabled: isGoogleOAuthConfigured() });
  }),
);

router.post(
  "/register",
  authRateLimit,
  asyncHandler(async (req, res) => {
    const config = getConfig();
    if (!config.ALLOW_PUBLIC_REGISTRATION) {
      sendError(res, 403, "REGISTRATION_DISABLED", "Public registration is disabled", req.requestId);
      return;
    }

    const input = registerSchema.parse(req.body);
    const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });

    try {
      const user = await prisma.user.create({
        data: {
          username: input.username,
          email: input.email ?? null,
          displayName: input.displayName,
          passwordHash,
          role: "user",
          ageAcknowledgedAt: input.ageAcknowledged ? new Date() : null,
        },
        select: safeUserSelect,
      });

      const verificationToken = await issueEmailVerificationToken(user.id);

      await regenerateSession(req);
      req.session.userId = user.id;
      await saveSession(req);

      res.status(201).json({ success: true, user: serializeUser(user), verificationToken });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new AppError(409, "ACCOUNT_EXISTS", "Username or email is already in use");
      }
      throw error;
    }
  }),
);

router.post(
  "/login",
  authRateLimit,
  asyncHandler(async (req, res) => {
    const input = loginSchema.parse(req.body);
    const normalizedLogin = input.login.toLowerCase();

    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { username: { equals: normalizedLogin, mode: "insensitive" } },
          { email: { equals: normalizedLogin, mode: "insensitive" } },
        ],
      },
    });

    if (!user) {
      throw new AppError(401, "INVALID_CREDENTIALS", genericLoginError);
    }

    const passwordOk = await argon2.verify(user.passwordHash, input.password);
    if (!passwordOk) {
      throw new AppError(401, "INVALID_CREDENTIALS", genericLoginError);
    }

    await regenerateSession(req);
    req.session.userId = user.id;
    await saveSession(req);

    const safeUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: safeUserSelect });
    res.json({ success: true, user: serializeUser(safeUser) });
  }),
);

router.get(
  "/google",
  authRateLimit,
  asyncHandler(async (req, res) => {
    const config = getConfig();
    if (!isGoogleOAuthConfigured(config)) {
      redirectAuthError(res, "google_not_configured");
      return;
    }

    const state = randomBytes(32).toString("hex");
    req.session.googleOAuthState = state;
    req.session.googleOAuthMode = req.session.userId ? "link" : "login";
    await saveSession(req);

    const client = getGoogleClient(config);
    const authorizationUrl = client.generateAuthUrl({
      access_type: "online",
      scope: [...googleScopes],
      state,
      prompt: "select_account",
      include_granted_scopes: false,
    });

    res.redirect(authorizationUrl);
  }),
);

router.get(
  "/google/callback",
  authRateLimit,
  asyncHandler(async (req, res) => {
    const config = getConfig();
    if (!isGoogleOAuthConfigured(config)) {
      redirectAuthError(res, "google_not_configured");
      return;
    }

    const oauthError = readString(req.query.error);
    if (oauthError) {
      redirectAuthError(res, oauthError === "access_denied" ? "google_cancelled" : "google_auth_failed");
      return;
    }

    const code = readString(req.query.code);
    if (!code) {
      redirectAuthError(res, "google_missing_code");
      return;
    }

    const state = readString(req.query.state);
    if (!state || state !== req.session.googleOAuthState) {
      await clearGoogleSessionState(req);
      redirectAuthError(res, "google_invalid_state");
      return;
    }

    const sessionMode = req.session.googleOAuthMode ?? "login";
    const linkingUserId = req.session.userId ?? null;
    await clearGoogleSessionState(req);

    const client = getGoogleClient(config);

    let idToken = "";
    try {
      const tokenResponse = await client.getToken(code);
      idToken = tokenResponse.tokens.id_token ?? "";
    } catch {
      redirectAuthError(res, "google_token_exchange_failed");
      return;
    }

    if (!idToken) {
      redirectAuthError(res, "google_token_exchange_failed");
      return;
    }

    let ticket;
    try {
      ticket = await client.verifyIdToken({
        idToken,
        audience: config.GOOGLE_CLIENT_ID,
      });
    } catch {
      redirectAuthError(res, "google_auth_failed");
      return;
    }

    const payload = ticket.getPayload();
    if (!payload || !payload.sub) {
      redirectAuthError(res, "google_auth_failed");
      return;
    }

    if (!googleIssuerSet.has(payload.iss ?? "") || payload.aud !== config.GOOGLE_CLIENT_ID) {
      redirectAuthError(res, "google_auth_failed");
      return;
    }

    if (payload.email_verified !== true) {
      redirectAuthError(res, "google_email_not_verified");
      return;
    }

    const googleEmail = typeof payload.email === "string" ? payload.email.toLowerCase() : null;
    if (!googleEmail) {
      redirectAuthError(res, "google_auth_failed");
      return;
    }

    const displayName = typeof payload.name === "string" && payload.name.trim() ? payload.name.trim() : googleEmail.split("@")[0];
    const avatarUrl = typeof payload.picture === "string" ? payload.picture : null;
    const providerAccountId = payload.sub;

    try {
      const userId = await prisma.$transaction(async (tx) => {
        const linkedAccount = await tx.authAccount.findUnique({
          where: {
            provider_providerAccountId: {
              provider: "google",
              providerAccountId,
            },
          },
          select: { userId: true },
        });

        if (linkedAccount) {
          if (sessionMode === "link" && linkingUserId && linkedAccount.userId !== linkingUserId) {
            throw new AppError(409, "google_link_conflict", "This Google account is already linked to another user");
          }
          return linkedAccount.userId;
        }

        if (sessionMode === "link") {
          if (!linkingUserId) {
            throw new AppError(400, "google_invalid_state", "Google linking session is missing");
          }

          const currentUser = await tx.user.findUnique({
            where: { id: linkingUserId },
            select: { id: true, email: true },
          });

          if (!currentUser) {
            throw new AppError(401, "google_invalid_state", "Google linking session is no longer valid");
          }

          const emailOwner = await tx.user.findFirst({
            where: { email: googleEmail },
            select: { id: true },
          });

          if (emailOwner && emailOwner.id !== currentUser.id) {
            throw new AppError(409, "google_email_conflict", "This Google email already belongs to another user");
          }

          const existingLink = await tx.authAccount.findFirst({
            where: { userId: currentUser.id, provider: "google" },
            select: { id: true },
          });

          if (existingLink) {
            throw new AppError(409, "google_link_conflict", "This user already has a linked Google account");
          }

          if (!currentUser.email) {
            await tx.user.update({ where: { id: currentUser.id }, data: { email: googleEmail } });
          }

          await tx.authAccount.create({
            data: {
              userId: currentUser.id,
              provider: "google",
              providerAccountId,
            },
          });

          return currentUser.id;
        }

        const emailOwner = await tx.user.findFirst({
          where: { email: googleEmail },
          select: { id: true },
        });

        if (emailOwner) {
          throw new AppError(409, "google_email_conflict", "This email is already linked to an existing account");
        }

        const passwordHash = await argon2.hash(randomBytes(32).toString("hex"), { type: argon2.argon2id });
        const username = await generateUniqueUsername(tx, displayName || googleEmail.split("@")[0]);

        const user = await tx.user.create({
          data: {
            username,
            email: googleEmail,
            displayName,
            avatarUrl,
            passwordHash,
            role: "user",
            emailVerifiedAt: new Date(),
          },
          select: { id: true },
        });

        await tx.authAccount.create({
          data: {
            userId: user.id,
            provider: "google",
            providerAccountId,
          },
        });

        return user.id;
      });

      await regenerateSession(req);
      req.session.userId = userId;
      await saveSession(req);

      res.redirect(getAppRedirectUrl(config));
    } catch (error) {
      if (error instanceof AppError) {
        redirectAuthError(res, error.code);
        return;
      }

      redirectAuthError(res, "google_auth_failed");
    }
  }),
);

router.post(
  "/logout",
  asyncHandler(async (req, res) => {
    if (req.session.userId) {
      await destroySession(req);
    }
    res.clearCookie("collab.sid", getSessionCookieOptions());
    res.json({ success: true });
  }),
);

router.post(
  "/verify-email/request",
  authRateLimit,
  asyncHandler(async (req, res) => {
    const input = emailVerificationRequestSchema.parse(req.body);
    const user = await prisma.user.findFirst({ where: { email: input.email }, select: { id: true } });
    if (!user) {
      res.json({ success: true });
      return;
    }

    const token = await issueEmailVerificationToken(user.id);
    res.json({ success: true, token });
  }),
);

router.post(
  "/verify-email/confirm",
  authRateLimit,
  asyncHandler(async (req, res) => {
    const input = verifyEmailSchema.parse(req.body);
    const tokenHash = hashOpaqueToken(input.token);
    const now = new Date();

    const token = await prisma.emailVerificationToken.findUnique({ where: { tokenHash } });
    if (!token || token.usedAt || token.expiresAt <= now) {
      throw new AppError(400, "INVALID_TOKEN", "Verification token is invalid or expired");
    }

    await prisma.$transaction(async (tx) => {
      await tx.emailVerificationToken.update({ where: { id: token.id }, data: { usedAt: now } });
      await tx.user.update({ where: { id: token.userId }, data: { emailVerifiedAt: now } });
    });

    res.json({ success: true });
  }),
);

router.post(
  "/password/forgot",
  authRateLimit,
  asyncHandler(async (req, res) => {
    const input = passwordResetRequestSchema.parse(req.body);
    const user = await prisma.user.findFirst({ where: { email: input.email }, select: { id: true } });
    if (!user) {
      res.json({ success: true });
      return;
    }
    const token = await issuePasswordResetToken(user.id);
    res.json({ success: true, token });
  }),
);

router.post(
  "/password/reset",
  authRateLimit,
  asyncHandler(async (req, res) => {
    const input = passwordResetSchema.parse(req.body);
    const tokenHash = hashOpaqueToken(input.token);
    const now = new Date();

    const token = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
    if (!token || token.usedAt || token.expiresAt <= now) {
      throw new AppError(400, "INVALID_TOKEN", "Password reset token is invalid or expired");
    }

    const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
    await prisma.$transaction(async (tx) => {
      await tx.passwordResetToken.update({ where: { id: token.id }, data: { usedAt: now } });
      await tx.user.update({ where: { id: token.userId }, data: { passwordHash } });
    });

    res.json({ success: true });
  }),
);

router.post(
  "/admin/break-glass/start",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.user || req.user.role !== "admin") {
      throw new AppError(403, "FORBIDDEN", "Administrator access required");
    }

    const projectId = readString(req.body?.projectId);
    const reason = readString(req.body?.reason)?.trim();
    if (!projectId || !reason || reason.length < 8) {
      throw new AppError(400, "VALIDATION_ERROR", "projectId and reason are required");
    }

    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
    if (!project) {
      throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found");
    }

    const audit = await prisma.breakGlassAccessAudit.create({
      data: {
        projectId,
        adminUserId: req.user.id,
        reason,
        expiresAt: new Date(Date.now() + 1000 * 60 * 30),
      },
      select: { id: true, expiresAt: true },
    });

    req.session.breakGlassProjectId = projectId;
    req.session.breakGlassAuditId = audit.id;
    await saveSession(req);

    res.json({ success: true, projectId, expiresAt: audit.expiresAt.toISOString() });
  }),
);

router.post(
  "/admin/break-glass/release",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.user || req.user.role !== "admin") {
      throw new AppError(403, "FORBIDDEN", "Administrator access required");
    }

    const auditId = req.session.breakGlassAuditId;
    if (auditId) {
      await prisma.breakGlassAccessAudit.updateMany({
        where: { id: auditId, status: "active" },
        data: { status: "released", releasedAt: new Date() },
      });
    }

    req.session.breakGlassProjectId = undefined;
    req.session.breakGlassAuditId = undefined;
    await saveSession(req);

    res.json({ success: true });
  }),
);

router.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.user) {
      throw new AppError(401, "UNAUTHENTICATED", "Authentication required");
    }
    res.json({ user: serializeUser(req.user) });
  }),
);

export default router;