import { apiRequest } from "./client";
import type { AuthUser } from "../types";

type AuthResponse = { success?: boolean; user: AuthUser };

export function getCurrentUser(signal?: AbortSignal) {
  return apiRequest<AuthResponse>("/api/auth/me", { signal });
}

export function login(payload: { login: string; password: string }) {
  return apiRequest<AuthResponse>("/api/auth/login", {
    method: "POST",
    body: payload,
  });
}

export function register(payload: { username: string; displayName: string; password: string; email?: string }) {
  return apiRequest<AuthResponse>("/api/auth/register", {
    method: "POST",
    body: payload,
  });
}

export function logout() {
  return apiRequest<{ success: boolean }>("/api/auth/logout", { method: "POST" });
}
