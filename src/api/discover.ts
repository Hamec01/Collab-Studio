import { apiRequest } from "./client";
import type { PrivatePublication } from "../types";

export interface DiscoverSearchParams {
  q?: string;
  kind?: "WORK" | "COLLAB";
  tags?: string;
  isFeatured?: string;
  limit?: number;
  offset?: number;
}

export function searchDiscoverPublications(params: DiscoverSearchParams = {}) {
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.kind) query.set("kind", params.kind);
  if (params.tags) query.set("tags", params.tags);
  if (params.isFeatured) query.set("isFeatured", params.isFeatured);
  if (params.limit) query.set("limit", params.limit.toString());
  if (params.offset) query.set("offset", params.offset.toString());

  const qs = query.toString();
  const url = qs ? `/api/discover?${qs}` : "/api/discover";

  return apiRequest<{ total: number; publications: PrivatePublication[] }>(url);
}
