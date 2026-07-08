import { apiRequest } from "./client";
import type { AuthUser, PublicProfile } from "../types";

export function getProfileMe(signal?: AbortSignal) {
  return apiRequest<{ user: AuthUser }>("/api/profile/me", { signal });
}

export function updateProfileMe(payload: {
  displayName: string;
  isPublicProfile: boolean;
  bio?: string;
  location?: string;
  website?: string;
}) {
  return apiRequest<{ user: AuthUser }>("/api/profile/me", {
    method: "PUT",
    body: payload,
  });
}

export function getPublicProfile(handle: string, signal?: AbortSignal) {
  return apiRequest<{ profile: PublicProfile }>(`/api/public/users/${encodeURIComponent(handle)}`, { signal });
}

export function followUser(handle: string) {
  return apiRequest<{ status: string }>(`/api/profile/users/${encodeURIComponent(handle)}/follow`, {
    method: "POST",
  });
}

export function unfollowUser(handle: string) {
  return apiRequest<{ status: string }>(`/api/profile/users/${encodeURIComponent(handle)}/unfollow`, {
    method: "POST",
  });
}
