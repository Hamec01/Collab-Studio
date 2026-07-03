import "express";
import "express-session";
import type { ProjectRole, UserRole } from "@prisma/client";
import type { CapabilityMatrix } from "./services/stage3Access";

declare module "express-session" {
  interface SessionData {
    userId?: string;
    googleOAuthState?: string;
    googleOAuthMode?: "login" | "link";
    breakGlassProjectId?: string;
    breakGlassAuditId?: string;
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
      emailVerifiedAt: Date | null;
      ageAcknowledgedAt: Date | null;
      createdAt: Date;
      updatedAt: Date;
    }

    interface ProjectAccess {
      projectId: string;
      role: ProjectRole;
      capabilities: CapabilityMatrix;
      source: "project" | "track" | "break_glass";
    }

    interface Request {
      requestId?: string;
      user?: User;
      projectAccess?: ProjectAccess;
    }
  }
}
