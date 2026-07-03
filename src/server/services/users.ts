import type { User } from "@prisma/client";

export type SafeUser = Pick<User, "id" | "username" | "email" | "displayName" | "avatarUrl" | "role" | "emailVerifiedAt" | "ageAcknowledgedAt" | "createdAt" | "updatedAt">;

export function serializeUser(user: SafeUser) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    role: user.role,
    emailVerifiedAt: user.emailVerifiedAt ? user.emailVerifiedAt.toISOString() : null,
    ageAcknowledgedAt: user.ageAcknowledgedAt ? user.ageAcknowledgedAt.toISOString() : null,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

export const safeUserSelect = {
  id: true,
  username: true,
  email: true,
  displayName: true,
  avatarUrl: true,
  role: true,
  emailVerifiedAt: true,
  ageAcknowledgedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;
