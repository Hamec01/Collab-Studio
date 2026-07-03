import { describe, expect, it } from "vitest";
import {
  LYRICS_LEASE_DURATION_MS,
  canAcquireLyricsLease,
  isLyricsLeaseOwner,
  isStaleLyricsRevision,
  nextLyricsLeaseExpiry,
  requireLyricsLease,
} from "../server/services/lyricsWorkspace";
import { hashOpaqueToken } from "../server/services/stage3Access";
import { lyricsLeaseTokenSchema, updateLyricsDraftSchema } from "../server/schemas/tracks";

const now = new Date("2026-07-03T10:00:00.000Z");

function lease(overrides: Partial<{ userId: string; tokenHash: string; expiresAt: Date }> = {}) {
  return {
    userId: "editor-a",
    tokenHash: hashOpaqueToken("token-a"),
    expiresAt: new Date(now.getTime() + 60_000),
    ...overrides,
  };
}

describe("Stage 4A lyrics lease", () => {
  it("allows one editor and rejects a second editor while the lease is active", () => {
    const activeLease = lease();

    expect(canAcquireLyricsLease(null, now)).toBe(true);
    expect(canAcquireLyricsLease(activeLease, now)).toBe(false);
    expect(isLyricsLeaseOwner(activeLease, { userId: "editor-a", leaseToken: "token-a", now })).toBe(true);
    expect(isLyricsLeaseOwner(activeLease, { userId: "editor-b", leaseToken: "token-b", now })).toBe(false);
  });

  it("allows acquisition after expiry and computes a 90 second lease", () => {
    expect(canAcquireLyricsLease(lease({ expiresAt: now }), now)).toBe(true);
    expect(nextLyricsLeaseExpiry(now).getTime() - now.getTime()).toBe(LYRICS_LEASE_DURATION_MS);
  });

  it("requires the exact active token for heartbeat, save, and release", () => {
    expect(() => requireLyricsLease(lease(), { userId: "editor-a", leaseToken: "token-a", now })).not.toThrow();
    expect(() => requireLyricsLease(lease(), { userId: "editor-a", leaseToken: "wrong", now })).toThrow(/missing or expired/);
    expect(() => requireLyricsLease(lease({ expiresAt: now }), { userId: "editor-a", leaseToken: "token-a", now })).toThrow(/missing or expired/);
  });
});

describe("Stage 4A lyrics OCC", () => {
  it("detects a stale monotonic lyrics revision", () => {
    expect(isStaleLyricsRevision(8, 7)).toBe(true);
    expect(isStaleLyricsRevision(8, 8)).toBe(false);
  });

  it("requires a non-negative revision and opaque lease token on save", () => {
    expect(updateLyricsDraftSchema.safeParse({ content: "draft", baseRevision: 3, leaseToken: "a".repeat(32) }).success).toBe(true);
    expect(updateLyricsDraftSchema.safeParse({ content: "draft", baseRevision: -1, leaseToken: "a".repeat(32) }).success).toBe(false);
    expect(updateLyricsDraftSchema.safeParse({ content: "draft", baseRevision: 3 }).success).toBe(false);
    expect(lyricsLeaseTokenSchema.safeParse({ leaseToken: "short" }).success).toBe(false);
  });
});
