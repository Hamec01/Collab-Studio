import { apiRequest } from "./client";
import type { PublicationComment, ContentReport } from "../types";

export function getPublicationComments(slug: string, signal?: AbortSignal) {
  return apiRequest<{ comments: PublicationComment[] }>(`/api/publications/${encodeURIComponent(slug)}/comments`, { signal });
}

export function createPublicationComment(slug: string, text: string) {
  return apiRequest<{ comment: PublicationComment }>(`/api/publications/${encodeURIComponent(slug)}/comments`, {
    method: "POST",
    body: { text },
  });
}

export function toggleCommentsClosed(slug: string, closed: boolean) {
  return apiRequest<{ success: boolean }>(`/api/publications/${encodeURIComponent(slug)}/comments/close`, {
    method: "POST",
    body: { closed },
  });
}

export function toggleCommentHidden(commentId: string, hidden: boolean) {
  return apiRequest<{ comment: PublicationComment }>(`/api/comments/${commentId}/hide`, {
    method: "POST",
    body: { hidden },
  });
}

export function blockUser(handle: string) {
  return apiRequest<{ success: boolean }>(`/api/users/${encodeURIComponent(handle)}/block`, { method: "POST" });
}

export function unblockUser(handle: string) {
  return apiRequest<{ success: boolean }>(`/api/users/${encodeURIComponent(handle)}/unblock`, { method: "POST" });
}

export function reportContent(payload: {
  contentType: "PUBLICATION" | "COMMENT";
  contentId: string;
  reason: string;
}) {
  return apiRequest<{ report: ContentReport }>("/api/reports", {
    method: "POST",
    body: payload,
  });
}

export function getAdminReports(signal?: AbortSignal) {
  return apiRequest<{ reports: ContentReport[] }>("/api/admin/reports", { signal });
}

export function resolveAdminReport(reportId: string, payload: {
  action: "SUSPEND_USER" | "BAN_USER" | "REMOVE_CONTENT" | "DISMISS";
  resolution: string;
}) {
  return apiRequest<{ success: boolean }>(`/api/admin/reports/${reportId}/resolve`, {
    method: "POST",
    body: payload,
  });
}
