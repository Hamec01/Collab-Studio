import { describe, expect, it } from "vitest";
import {
  capabilityPresetDefaults,
  ensureVerifiedForProtectedWrite,
  hashOpaqueToken,
  mergeCustomCapabilities,
  resolveProjectTrackAccess,
} from "../server/services/stage3Access";

describe("stage3 access helpers", () => {
  it("hashOpaqueToken is deterministic", () => {
    const token = "example-token";
    expect(hashOpaqueToken(token)).toBe(hashOpaqueToken(token));
    expect(hashOpaqueToken(token)).not.toBe(hashOpaqueToken(`${token}-2`));
  });

  it("ensureVerifiedForProtectedWrite rejects unverified users", () => {
    expect(() =>
      ensureVerifiedForProtectedWrite({ emailVerifiedAt: null, ageAcknowledgedAt: new Date() }),
    ).toThrow(/Email verification is required/);

    try {
      ensureVerifiedForProtectedWrite({ emailVerifiedAt: null, ageAcknowledgedAt: new Date() });
    } catch (error: any) {
      expect(error.code).toBe("EMAIL_VERIFICATION_REQUIRED");
    }

    expect(() =>
      ensureVerifiedForProtectedWrite({ emailVerifiedAt: new Date(), ageAcknowledgedAt: null }),
    ).toThrow(/18\+ acknowledgement is required/);

    try {
      ensureVerifiedForProtectedWrite({ emailVerifiedAt: new Date(), ageAcknowledgedAt: null });
    } catch (error: any) {
      expect(error.code).toBe("AGE_ACKNOWLEDGEMENT_REQUIRED");
    }

    expect(() =>
      ensureVerifiedForProtectedWrite({ emailVerifiedAt: new Date(), ageAcknowledgedAt: new Date() }),
    ).not.toThrow();
  });

  it("mergeCustomCapabilities overlays only provided booleans", () => {
    const base = capabilityPresetDefaults("editor", "editor");
    const merged = mergeCustomCapabilities(base, {
      canDownload: false,
      canManageMembers: true,
      unknown: 1,
    });

    expect(merged.canDownload).toBe(false);
    expect(merged.canManageMembers).toBe(true);
    expect(merged.canUploadAudio).toBe(true);
  });

  it("resolveProjectTrackAccess prefers project membership", async () => {
    const prisma = {
      projectMember: {
        findUnique: async () => ({
          role: "editor",
          capabilityPreset: "editor",
          customCapabilities: {},
        }),
      },
      trackAccessGrant: {
        findFirst: async () => null,
      },
    } as any;

    const access = await resolveProjectTrackAccess({
      prisma,
      user: { id: "u1", role: "user" },
      projectId: "p1",
      trackId: "t1",
    });

    expect(access).toBeTruthy();
    expect(access?.source).toBe("project");
    expect(access?.capabilities.canUploadAudio).toBe(true);
  });

  it("resolveProjectTrackAccess falls back to active track grant", async () => {
    const prisma = {
      projectMember: {
        findUnique: async () => null,
      },
      trackAccessGrant: {
        findFirst: async () => ({
          role: "viewer",
          canDownload: false,
          customCapabilities: { canComment: true },
        }),
      },
    } as any;

    const access = await resolveProjectTrackAccess({
      prisma,
      user: { id: "u2", role: "user" },
      projectId: "p1",
      trackId: "t1",
    });

    expect(access).toBeTruthy();
    expect(access?.source).toBe("track");
    expect(access?.capabilities.canDownload).toBe(false);
    expect(access?.capabilities.canComment).toBe(true);
  });

  it("resolveProjectTrackAccess allows break-glass for matching project", async () => {
    const prisma = {
      projectMember: {
        findUnique: async () => null,
      },
      trackAccessGrant: {
        findFirst: async () => null,
      },
    } as any;

    const allowed = await resolveProjectTrackAccess({
      prisma,
      user: { id: "admin-1", role: "admin" },
      projectId: "p1",
      breakGlassProjectId: "p1",
    });

    const denied = await resolveProjectTrackAccess({
      prisma,
      user: { id: "admin-1", role: "admin" },
      projectId: "p1",
      breakGlassProjectId: "p2",
    });

    expect(allowed).toBeTruthy();
    expect(allowed?.source).toBe("break_glass");
    expect(denied).toBeNull();
  });
});
