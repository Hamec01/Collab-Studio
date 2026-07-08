import type { User } from "@prisma/client";

export type SafeUser = Pick<User, "id" | "username" | "email" | "displayName" | "avatarUrl" | "isPublicProfile" | "bio" | "location" | "website" | "role" | "emailVerifiedAt" | "ageAcknowledgedAt" | "createdAt" | "updatedAt">;
export type PublicProfileUser = Pick<User, "id" | "username" | "displayName" | "avatarUrl" | "isPublicProfile" | "bio" | "location" | "website" | "createdAt" | "updatedAt">;

export function serializeUser(user: SafeUser) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    isPublicProfile: user.isPublicProfile,
    bio: user.bio ?? null,
    location: user.location ?? null,
    website: user.website ?? null,
    role: user.role,
    emailVerifiedAt: user.emailVerifiedAt ? user.emailVerifiedAt.toISOString() : null,
    ageAcknowledgedAt: user.ageAcknowledgedAt ? user.ageAcknowledgedAt.toISOString() : null,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

export function serializePublicProfile(user: PublicProfileUser) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl ?? null,
    bio: user.bio ?? null,
    location: user.location ?? null,
    website: user.website ?? null,
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
  isPublicProfile: true,
  bio: true,
  location: true,
  website: true,
  role: true,
  emailVerifiedAt: true,
  ageAcknowledgedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

export const publicProfileSelect = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
  isPublicProfile: true,
  bio: true,
  location: true,
  website: true,
  createdAt: true,
  updatedAt: true,
} as const;
