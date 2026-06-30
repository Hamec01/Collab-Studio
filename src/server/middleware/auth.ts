import type { NextFunction, Request, Response } from "express";
import { prisma } from "../db";
import { safeUserSelect } from "../services/users";
import { sendError } from "./errors";

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const userId = req.session.userId;
  if (!userId) {
    sendError(res, 401, "UNAUTHENTICATED", "Authentication required", req.requestId);
    return;
  }

  prisma.user
    .findUnique({ where: { id: userId }, select: safeUserSelect })
    .then((user) => {
      if (!user) {
        req.session.destroy(() => undefined);
        sendError(res, 401, "UNAUTHENTICATED", "Authentication required", req.requestId);
        return;
      }

      req.user = user;
      next();
    })
    .catch(next);
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    sendError(res, 401, "UNAUTHENTICATED", "Authentication required", req.requestId);
    return;
  }

  if (req.user.role !== "admin") {
    sendError(res, 403, "FORBIDDEN", "Administrator access required", req.requestId);
    return;
  }

  next();
}

export function requireProjectMember(_req: Request, _res: Response, next: NextFunction) {
  // Stage 3: enforce project membership after project routes move from JSON storage to Prisma.
  next();
}

export function requireProjectEditor(_req: Request, _res: Response, next: NextFunction) {
  // Stage 3: enforce owner/editor access after project routes move from JSON storage to Prisma.
  next();
}

export function requireProjectOwner(_req: Request, _res: Response, next: NextFunction) {
  // Stage 3: enforce owner/admin access after project routes move from JSON storage to Prisma.
  next();
}
