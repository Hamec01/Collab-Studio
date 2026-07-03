import { createHash, randomBytes } from "node:crypto";
import type { CapabilityPreset, PrismaClient, ProjectRole, User } from "@prisma/client";
import { AppError } from "../middleware/errors";

export type CapabilityMatrix = {
  canUploadAudio: boolean;
  canComment: boolean;
  canChat: boolean;
  canCreateTask: boolean;
  canManageMembers: boolean;
  canDownload: boolean;
};

export type ResolvedAccess = {
  role: ProjectRole;
  source: "project" | "track" | "break_glass";
  capabilities: CapabilityMatrix;
};

export function hashOpaqueToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function newOpaqueToken() {
  return randomBytes(32).toString("hex");
}

export function nowUtc() {
  return new Date();
}

export function capabilityPresetDefaults(preset: CapabilityPreset, role: ProjectRole): CapabilityMatrix {
  if (preset === "custom") {
    return {
      canUploadAudio: role !== "viewer",
      canComment: role !== "viewer",
      canChat: role !== "viewer",
      canCreateTask: role !== "viewer",
      canManageMembers: role === "owner",
      canDownload: role !== "viewer",
    };
  }

  if (preset === "owner" || role === "owner") {
    return {
      canUploadAudio: true,
      canComment: true,
      canChat: true,
      canCreateTask: true,
      canManageMembers: true,
      canDownload: true,
    };
  }

  if (preset === "editor" || role === "editor") {
    return {
      canUploadAudio: true,
      canComment: true,
      canChat: true,
      canCreateTask: true,
      canManageMembers: false,
      canDownload: true,
    };
  }

  return {
    canUploadAudio: false,
    canComment: false,
    canChat: false,
    canCreateTask: false,
    canManageMembers: false,
    canDownload: false,
  };
}

export function mergeCustomCapabilities(base: CapabilityMatrix, customRaw: unknown): CapabilityMatrix {
  if (!customRaw || typeof customRaw !== "object") return base;
  const custom = customRaw as Record<string, unknown>;
  return {
    canUploadAudio: typeof custom.canUploadAudio === "boolean" ? custom.canUploadAudio : base.canUploadAudio,
    canComment: typeof custom.canComment === "boolean" ? custom.canComment : base.canComment,
    canChat: typeof custom.canChat === "boolean" ? custom.canChat : base.canChat,
    canCreateTask: typeof custom.canCreateTask === "boolean" ? custom.canCreateTask : base.canCreateTask,
    canManageMembers: typeof custom.canManageMembers === "boolean" ? custom.canManageMembers : base.canManageMembers,
    canDownload: typeof custom.canDownload === "boolean" ? custom.canDownload : base.canDownload,
  };
}

export function ensureVerifiedForProtectedWrite(user: Pick<User, "emailVerifiedAt" | "ageAcknowledgedAt">) {
  if (!user.emailVerifiedAt) {
    throw new AppError(403, "EMAIL_NOT_VERIFIED", "Email verification is required for this action");
  }
  if (!user.ageAcknowledgedAt) {
    throw new AppError(403, "AGE_ACK_REQUIRED", "18+ acknowledgement is required for this action");
  }
}

export async function resolveProjectTrackAccess(args: {
  prisma: PrismaClient;
  user: Pick<User, "id" | "role">;
  projectId: string;
  trackId?: string;
  breakGlassProjectId?: string;
}) {
  const now = nowUtc();
  const projectMember = await args.prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId: args.projectId, userId: args.user.id } },
    select: {
      role: true,
      capabilityPreset: true,
      customCapabilities: true,
    },
  });

  if (projectMember) {
    const base = capabilityPresetDefaults(projectMember.capabilityPreset, projectMember.role);
    return {
      role: projectMember.role,
      source: "project" as const,
      capabilities: mergeCustomCapabilities(base, projectMember.customCapabilities),
    } satisfies ResolvedAccess;
  }

  if (args.trackId) {
    const trackGrant = await args.prisma.trackAccessGrant.findFirst({
      where: {
        projectId: args.projectId,
        trackId: args.trackId,
        userId: args.user.id,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: {
        role: true,
        canDownload: true,
        customCapabilities: true,
      },
    });

    if (trackGrant) {
      const base = capabilityPresetDefaults("custom", trackGrant.role);
      return {
        role: trackGrant.role,
        source: "track" as const,
        capabilities: mergeCustomCapabilities({ ...base, canDownload: trackGrant.canDownload }, trackGrant.customCapabilities),
      } satisfies ResolvedAccess;
    }
  }

  if (args.user.role === "admin" && args.breakGlassProjectId === args.projectId) {
    return {
      role: "owner" as const,
      source: "break_glass" as const,
      capabilities: capabilityPresetDefaults("owner", "owner"),
    } satisfies ResolvedAccess;
  }

  return null;
}
