import type { NextFunction, Request, Response } from "express";
import { prisma } from "../db";
import { canEditProject, canOwnProject } from "../services/access";
import { resolveProjectTrackAccess } from "../services/stage3Access";
import { safeUserSelect } from "../services/users";
import { sendError } from "./errors";

function getProjectId(req: Request) {
  return req.params.projectId || req.params.id;
}

function getTrackId(req: Request) {
  return req.params.trackId;
}

async function validateBreakGlassSession(req: Request, projectId: string) {
  if (!req.user || req.user.role !== "admin") return;
  const auditId = req.session.breakGlassAuditId;
  const breakGlassProjectId = req.session.breakGlassProjectId;
  if (!auditId || !breakGlassProjectId || breakGlassProjectId !== projectId) return;

  const audit = await prisma.breakGlassAccessAudit.findFirst({
    where: {
      id: auditId,
      projectId,
      adminUserId: req.user.id,
      status: "active",
      expiresAt: { gt: new Date() },
    },
    select: { id: true },
  });

  if (!audit) {
    req.session.breakGlassProjectId = undefined;
    req.session.breakGlassAuditId = undefined;
  }
}

function loadAuthenticatedUser(req: Request, res: Response, next: NextFunction, onLoaded: () => void) {
  if (req.user) {
    onLoaded();
    return;
  }

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
      onLoaded();
    })
    .catch(next);
}

function loadOptionalUser(req: Request, next: NextFunction, onLoaded: () => void) {
  if (req.user) {
    onLoaded();
    return;
  }

  const userId = req.session.userId;
  if (!userId) {
    onLoaded();
    return;
  }

  prisma.user
    .findUnique({ where: { id: userId }, select: safeUserSelect })
    .then((user) => {
      if (!user) {
        req.session.destroy(() => undefined);
        onLoaded();
        return;
      }

      req.user = user;
      onLoaded();
    })
    .catch(next);
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  loadAuthenticatedUser(req, res, next, next);
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  loadOptionalUser(req, next, next);
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  loadAuthenticatedUser(req, res, next, () => {
    if (!req.user || req.user.role !== "admin") {
      sendError(res, 403, "FORBIDDEN", "Administrator access required", req.requestId);
      return;
    }

    next();
  });
}

export function requireProjectMember(req: Request, res: Response, next: NextFunction) {
  loadAuthenticatedUser(req, res, next, () => {
    const projectId = getProjectId(req);
    const trackId = getTrackId(req);
    if (!projectId) {
      sendError(res, 400, "VALIDATION_ERROR", "Project id is required", req.requestId);
      return;
    }

    validateBreakGlassSession(req, projectId)
      .then(() =>
        resolveProjectTrackAccess({
          prisma,
          user: { id: req.user!.id, role: req.user!.role },
          projectId,
          trackId,
          breakGlassProjectId: req.session.breakGlassProjectId,
        }),
      )
      .then((access) => {
        if (!access) {
          sendError(res, 404, "PROJECT_NOT_FOUND", "Project not found", req.requestId);
          return;
        }

        req.projectAccess = { projectId, role: access.role, capabilities: access.capabilities, source: access.source };
        next();
      })
      .catch(next);
  });
}

export function requireProjectEditor(req: Request, res: Response, next: NextFunction) {
  requireProjectMember(req, res, (error?: unknown) => {
    if (error) {
      next(error);
      return;
    }

    const role = req.projectAccess?.role;
    if (!role || !canEditProject(role)) {
      sendError(res, 403, "FORBIDDEN", "Project editor access required", req.requestId);
      return;
    }

    next();
  });
}

export function requireProjectOwner(req: Request, res: Response, next: NextFunction) {
  requireProjectMember(req, res, (error?: unknown) => {
    if (error) {
      next(error);
      return;
    }

    const role = req.projectAccess?.role;
    if (!role || !canOwnProject(role)) {
      sendError(res, 403, "FORBIDDEN", "Project owner access required", req.requestId);
      return;
    }

    next();
  });
}
