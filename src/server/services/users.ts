import type { User } from "@prisma/client";

export type SafeUser = Pick<User, "id" | "username" | "email" | "displayName" | "avatarUrl" | "role" | "createdAt" | "updatedAt">;

export function serializeUser(user: SafeUser) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    role: user.role,
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
  createdAt: true,
  updatedAt: true,
} as const;
