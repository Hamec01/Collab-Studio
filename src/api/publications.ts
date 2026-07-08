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

