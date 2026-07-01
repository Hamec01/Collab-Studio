import { apiRequest } from "./client";
import type { AppNotification } from "../types";

export function listNotifications(signal?: AbortSignal) {
  return apiRequest<AppNotification[]>("/api/notifications", { signal });
}

export function markNotificationRead(notificationId: string) {
  return apiRequest<{ success: boolean }>(`/api/notifications/${notificationId}/read`, {
    method: "POST",
  });
}

export function markAllNotificationsRead() {
  return apiRequest<{ success: boolean; updated: number }>("/api/notifications/read-all", {
    method: "POST",
  });
}
