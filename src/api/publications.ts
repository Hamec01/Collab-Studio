import { apiRequest } from "./client";
import type { PrivatePublication, PublicWork } from "../types";

export function getMyPublications(signal?: AbortSignal) {
  return apiRequest<{ publications: PrivatePublication[] }>("/api/publications/mine", { signal });
}

export function createWorkPublication(payload: {
  projectId: string;
  trackId: string;
  allowDownload?: boolean;
  title?: string;
  description?: string;
  coverImageUrl?: string;
  tags?: string[];
  language?: string;
}) {
  return apiRequest<{ publication: PrivatePublication }>("/api/publications/works", {
    method: "POST",
    body: payload,
  });
}

export function archivePublication(publicationId: string) {
  return apiRequest<{ publication: PrivatePublication }>(`/api/publications/${publicationId}/archive`, {
    method: "POST",
  });
}

export function getPublicWork(slug: string, signal?: AbortSignal) {
  return apiRequest<{ work: PublicWork }>(`/api/public/works/${encodeURIComponent(slug)}`, { signal });
}

export function createCollabPublication(payload: {
  projectId: string;
  trackId: string;
  allowDownload?: boolean;
  title?: string;
  description?: string;
  coverImageUrl?: string;
  tags?: string[];
  language?: string;
  budget?: string;
  terms?: string;
  rolesNeeded?: string[];
}) {
  return apiRequest<{ publication: PrivatePublication }>("/api/publications/collabs", {
    method: "POST",
    body: payload,
  });
}

export function getPublicCollab(slug: string, signal?: AbortSignal) {
  return apiRequest<{ collab: PublicWork }>(`/api/public/collabs/${encodeURIComponent(slug)}`, { signal });
}

export function likeWork(slug: string) {
  return apiRequest<{ ok: boolean }>(`/api/public/works/${encodeURIComponent(slug)}/like`, { method: "POST" });
}

export function unlikeWork(slug: string) {
  return apiRequest<{ ok: boolean }>(`/api/public/works/${encodeURIComponent(slug)}/like`, { method: "DELETE" });
}

export function playWork(slug: string) {
  return apiRequest<{ ok: boolean }>(`/api/public/works/${encodeURIComponent(slug)}/play`, { method: "POST" });
}

export function likeCollab(slug: string) {
  return apiRequest<{ ok: boolean }>(`/api/public/collabs/${encodeURIComponent(slug)}/like`, { method: "POST" });
}

export function unlikeCollab(slug: string) {
  return apiRequest<{ ok: boolean }>(`/api/public/collabs/${encodeURIComponent(slug)}/like`, { method: "DELETE" });
}

export function playCollab(slug: string) {
  return apiRequest<{ ok: boolean }>(`/api/public/collabs/${encodeURIComponent(slug)}/play`, { method: "POST" });
}

export function requestJoinFromWork(slug: string, payload?: { requestedRole?: "viewer" | "editor"; message?: string }) {
  return apiRequest<{
    request: {
      id: string;
      projectId: string;
      status: string;
      requestedRole: "viewer" | "editor";
      message: string | null;
      createdAt: string;
      updatedAt: string;
    };
  }>(`/api/public/works/${encodeURIComponent(slug)}/join-request`, {
    method: "POST",
    body: payload ?? {},
  });
}

export function requestJoinFromCollab(slug: string, payload?: { requestedRole?: "viewer" | "editor"; message?: string }) {
  return apiRequest<{
    request: {
      id: string;
      projectId: string;
      status: string;
      requestedRole: "viewer" | "editor";
      message: string | null;
      createdAt: string;
      updatedAt: string;
    };
  }>(`/api/public/collabs/${encodeURIComponent(slug)}/join-request`, {
    method: "POST",
    body: payload ?? {},
  });
}

export interface PublicationStats {
  totalPlays: number;
  totalLikes: number;
  byDate: { date: string; plays: number; likes: number }[];
  publications: { id: string; title: string; plays: number; likes: number }[];
}

export function getPublicationsStats(signal?: AbortSignal) {
  return apiRequest<PublicationStats>("/api/publications/stats", { signal });
}
