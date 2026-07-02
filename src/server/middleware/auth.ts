import type { NextFunction, Request, Response } from "express";
import { prisma } from "../db";
import { canEditProject, canOwnProject } from "../services/access";
import { safeUserSelect } from "../services/users";
import { sendError } from "./errors";

function getProjectId(req: Request) {
  return req.params.projectId || req.params.id;
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

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  loadAuthenticatedUser(req, res, next, next);
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
    if (!projectId) {
      sendError(res, 400, "VALIDATION_ERROR", "Project id is required", req.requestId);
      return;
    }

    prisma.project
      .findUnique({
        where: { id: projectId },
        select: {
          id: true,
          members: {
            where: { userId: req.user?.id },
            select: { role: true },
          },
        },
      })
      .then((project) => {
        if (!project) {
          sendError(res, 404, "PROJECT_NOT_FOUND", "Project not found", req.requestId);
          return;
        }

        const membership = project.members[0];
        if (!membership) {
          sendError(res, 404, "PROJECT_NOT_FOUND", "Project not found", req.requestId);
          return;
        }

        req.projectAccess = { projectId, role: membership.role };
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
