import { apiRequest } from "./client";
import type { PrivatePublication, PublicWork } from "../types";

export function getMyPublications(signal?: AbortSignal) {
  return apiRequest<{ publications: PrivatePublication[] }>("/api/publications/mine", { signal });
}

export function createWorkPublication(payload: {
  projectId: string;
  trackId: string;
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
