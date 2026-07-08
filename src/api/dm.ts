import { apiRequest } from "./client";
import type { DmRequest, DirectMessage } from "../types";

export function sendDmRequest(handle: string, text: string) {
  return apiRequest<{ request: DmRequest }>("/api/dm/requests", {
    method: "POST",
    body: { handle, text },
  });
}

export function getDmRequests() {
  return apiRequest<{ requests: DmRequest[] }>("/api/dm/requests");
}

export function getDmConversations() {
  return apiRequest<{ conversations: DmRequest[] }>("/api/dm/conversations");
}

export function respondToDmRequest(requestId: string, action: "accept" | "reject" | "block") {
  return apiRequest<{ request: DmRequest }>(`/api/dm/requests/${requestId}/respond`, {
    method: "POST",
    body: { action },
  });
}

export function getConversationMessages(requestId: string) {
  return apiRequest<{ messages: DirectMessage[] }>(`/api/dm/conversations/${requestId}/messages`);
}

export function sendConversationMessage(requestId: string, text: string) {
  return apiRequest<{ message: DirectMessage }>(`/api/dm/conversations/${requestId}/messages`, {
    method: "POST",
    body: { text },
  });
}
