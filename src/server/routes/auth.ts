import argon2 from "argon2";
import { Router, type NextFunction, type Request, type Response } from "express";
import { Prisma } from "@prisma/client";
import { getConfig } from "../config";
import { prisma } from "../db";
import { requireAuth } from "../middleware/auth";
import { AppError, sendError } from "../middleware/errors";
import { authRateLimit } from "../middleware/rateLimits";
import { loginSchema, registerSchema } from "../schemas/auth";
import { safeUserSelect, serializeUser } from "../services/users";
import { getSessionCookieOptions } from "../session";

const genericLoginError = "Invalid username/email or password";
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
        },
        select: safeUserSelect,
      });

      await regenerateSession(req);
      req.session.userId = user.id;
      await saveSession(req);

      res.status(201).json({ success: true, user: serializeUser(user) });
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
        OR: [{ username: normalizedLogin }, { email: normalizedLogin }],
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
