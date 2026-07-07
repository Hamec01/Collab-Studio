import { apiRequest } from "./client";
import type { AuthUser } from "../types";

type AuthResponse = { success?: boolean; user: AuthUser; verificationToken?: string };
type AuthProvidersResponse = { googleOAuthEnabled: boolean; publicRegistrationEnabled: boolean };

export function getCurrentUser(signal?: AbortSignal) {
  return apiRequest<AuthResponse>("/api/auth/me", { signal });
}

export function login(payload: { login: string; password: string }) {
  return apiRequest<AuthResponse>("/api/auth/login", {
    method: "POST",
    body: payload,
  });
}

export function register(payload: { username: string; displayName: string; password: string; email?: string; ageAcknowledged: true }) {
  return apiRequest<AuthResponse>("/api/auth/register", {
    method: "POST",
    body: payload,
  });
}

export function logout() {
  return apiRequest<{ success: boolean }>("/api/auth/logout", { method: "POST" });
}

export function getAuthProviders(signal?: AbortSignal) {
  return apiRequest<AuthProvidersResponse>("/api/auth/providers", { signal });
}

export function confirmEmailVerification(token: string) {
  return apiRequest<{ success: boolean }>("/api/auth/verify-email/confirm", {
    method: "POST",
    body: { token },
  });
}

export function acknowledgeAge() {
  return apiRequest<{ success: boolean; user: AuthUser }>("/api/auth/acknowledge-age", {
    method: "POST",
  });
}
