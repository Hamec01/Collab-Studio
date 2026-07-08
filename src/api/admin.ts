import { apiRequest } from "./client";

export type AdminUser = {
  id: string;
  username: string;
  displayName: string;
  email: string;
  role: string;
  createdAt: string;
  deletedAt: string | null;
};

export type AdminContentReport = {
  id: string;
  reporterId: string;
  contentType: string;
  contentId: string;
  reason: string;
  status: string;
  resolution: string | null;
  createdAt: string;
  reporter: {
    username: string;
    displayName: string;
  };
};

export type AdminStats = {
  totalUsers: number;
  totalPublications: number;
  pendingReports: number;
};

export function getAdminUsers() {
  return apiRequest<{ users: AdminUser[] }>("/api/admin/users");
}

export function suspendAdminUser(id: string, action: "suspend" | "restore") {
  return apiRequest<{ user: { id: string; username: string; role: string } }>(`/api/admin/users/${id}/suspend`, {
    method: "POST",
    body: { action },
  });
}

export function getAdminReports() {
  return apiRequest<{ reports: AdminContentReport[] }>("/api/admin/reports");
}

export function resolveAdminReport(id: string, action: "RESOLVED" | "DISMISSED", resolution?: string) {
  return apiRequest<{ report: AdminContentReport }>(`/api/admin/reports/${id}/resolve`, {
    method: "POST",
    body: { action, resolution },
  });
}

export function getAdminStats() {
  return apiRequest<{ stats: AdminStats }>("/api/admin/stats");
}
