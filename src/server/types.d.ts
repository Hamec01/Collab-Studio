import "express";
import "express-session";
import type { ProjectRole, UserRole } from "@prisma/client";

declare module "express-session" {
  interface SessionData {
    userId?: string;
  }
}

declare global {
  namespace Express {
    interface User {
      id: string;
      username: string;
      email: string | null;
      displayName: string;
      avatarUrl: string | null;
      role: UserRole;
      createdAt: Date;
      updatedAt: Date;
    }

    interface ProjectAccess {
      projectId: string;
      role: ProjectRole | "admin";
      isAdmin: boolean;
    }

    interface Request {
      requestId?: string;
      user?: User;
      projectAccess?: ProjectAccess;
    }
  }
}
