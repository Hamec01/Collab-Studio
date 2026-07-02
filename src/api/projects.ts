import { apiRequest } from "./client";
import type {
  Annotation,
  AudioVersion,
  ChatMessage,
  Comment,
  LyricVersion,
  ProjectMember,
  Project,
  Task,
  Track,
} from "../types";

export function listProjects(signal?: AbortSignal) {
  return apiRequest<Project[]>("/api/projects", { signal });
}

export function getProject(projectId: string, signal?: AbortSignal) {
  return apiRequest<Project>(`/api/projects/${projectId}`, { signal });
}

export function createProject(payload: { title: string; type: "single" | "album"; tags?: string[]; coverUrl?: string }) {
  return apiRequest<Project>("/api/projects", {
    method: "POST",
    body: payload,
  });
}

export function deleteProject(projectId: string) {
  return apiRequest<{ success: boolean }>(`/api/projects/${projectId}`, { method: "DELETE" });
}

export function addProjectMember(projectId: string, payload: { login: string; role: "viewer" | "editor" }) {
  return apiRequest<{ member: ProjectMember }>(`/api/projects/${projectId}/members`, {
    method: "POST",
    body: {
      login: payload.login,
      role: payload.role,
    },
  });
}

export function updateProjectMemberRole(projectId: string, userId: string, payload: { role: "viewer" | "editor" }) {
  return apiRequest<{ member: ProjectMember }>(`/api/projects/${projectId}/members/${userId}`, {
    method: "PATCH",
    body: payload,
  });
}

export function removeProjectMember(projectId: string, userId: string) {
  return apiRequest<{ success: boolean }>(`/api/projects/${projectId}/members/${userId}`, {
    method: "DELETE",
  });
}

export function createTrack(projectId: string, payload: { title: string; lyrics?: string; tags?: string[]; versionLabel?: string }) {
  return apiRequest<Track>(`/api/projects/${projectId}/tracks`, {
    method: "POST",
    body: payload,
  });
}

export function getTrack(projectId: string, trackId: string, signal?: AbortSignal) {
  return apiRequest<Track>(`/api/projects/${projectId}/tracks/${trackId}`, { signal });
}

export function updateTrack(projectId: string, trackId: string, payload: { title?: string; lyrics?: string; tags?: string[]; versionLabel?: string }) {
  return apiRequest<Track>(`/api/projects/${projectId}/tracks/${trackId}`, {
    method: "PATCH",
    body: payload,
  });
}

export function pinLyricVersion(projectId: string, trackId: string, versionId: string) {
  return apiRequest<LyricVersion>(`/api/projects/${projectId}/tracks/${trackId}/versions/${versionId}/pin`, {
    method: "PATCH",
  });
}

export function createComment(projectId: string, trackId: string, payload: { text: string; lineIndex?: number }) {
  return apiRequest<Comment>(`/api/projects/${projectId}/tracks/${trackId}/comments`, {
    method: "POST",
    body: payload,
  });
}

export function resolveComment(projectId: string, trackId: string, commentId: string, payload?: { resolved?: boolean }) {
  return apiRequest<Comment>(`/api/projects/${projectId}/tracks/${trackId}/comments/${commentId}/resolve`, {
    method: "PUT",
    body: payload,
  });
}

export function postChatMessage(projectId: string, trackId: string, payload: { text: string }) {
  return apiRequest<ChatMessage>(`/api/projects/${projectId}/tracks/${trackId}/chat`, {
    method: "POST",
    body: payload,
  });
}

export function createTask(
  projectId: string,
  trackId: string,
  payload: { title: string; description?: string; assignedToId?: string | null },
) {
  return apiRequest<Task>(`/api/projects/${projectId}/tracks/${trackId}/tasks`, {
    method: "POST",
    body: payload,
  });
}

export function updateTask(
  projectId: string,
  trackId: string,
  taskId: string,
  payload: { title?: string; description?: string | null; status?: "todo" | "in-progress" | "done"; assignedToId?: string | null },
) {
  return apiRequest<Task>(`/api/projects/${projectId}/tracks/${trackId}/tasks/${taskId}`, {
    method: "PUT",
    body: payload,
  });
}

export function createAnnotation(projectId: string, trackId: string, payload: { timestampSeconds: number; text: string }) {
  return apiRequest<Annotation>(`/api/projects/${projectId}/tracks/${trackId}/annotations`, {
    method: "POST",
    body: payload,
  });
}

export function uploadTrackAudio(projectId: string, trackId: string, file: File) {
  const formData = new FormData();
  formData.append("file", file);
  return apiRequest<AudioVersion>(`/api/projects/${projectId}/tracks/${trackId}/audio`, {
    method: "POST",
    body: formData,
  });
}

export function attachExternalAudio(
  projectId: string,
  trackId: string,
  payload: { label: string; externalUrl: string; externalProvider: "google" | "yandex" | "telegram" | "other" },
) {
  return apiRequest<AudioVersion>(`/api/projects/${projectId}/tracks/${trackId}/audio`, {
    method: "POST",
    body: payload,
  });
}
