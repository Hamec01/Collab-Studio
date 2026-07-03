import { AppError } from "../middleware/errors";
import { hashOpaqueToken } from "./stage3Access";

export const LYRICS_LEASE_DURATION_MS = 90_000;
export const LYRICS_LEASE_HEARTBEAT_MS = 30_000;

export type LyricsLeaseSnapshot = {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
};

export function nextLyricsLeaseExpiry(now: Date) {
  return new Date(now.getTime() + LYRICS_LEASE_DURATION_MS);
}

export function canAcquireLyricsLease(lease: Pick<LyricsLeaseSnapshot, "expiresAt"> | null, now: Date) {
  return !lease || lease.expiresAt.getTime() <= now.getTime();
}

export function isLyricsLeaseOwner(
  lease: LyricsLeaseSnapshot | null,
  input: { userId: string; leaseToken: string; now: Date },
) {
  return Boolean(
    lease
      && lease.userId === input.userId
      && lease.tokenHash === hashOpaqueToken(input.leaseToken)
      && lease.expiresAt.getTime() > input.now.getTime(),
  );
}

export function requireLyricsLease(
  lease: LyricsLeaseSnapshot | null,
  input: { userId: string; leaseToken: string; now: Date },
) {
  if (!isLyricsLeaseOwner(lease, input)) {
    throw new AppError(409, "LYRICS_LEASE_LOST", "Lyrics edit lease is missing or expired");
  }
}

export function isStaleLyricsRevision(currentRevision: number, baseRevision: number) {
  return currentRevision !== baseRevision;
}
