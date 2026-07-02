import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { AuthUser } from "../../types";
import { getAuthProviders, getCurrentUser, login as loginApi, logout as logoutApi, register as registerApi } from "../../api/auth";
import { isApiError } from "../../api/client";

export type AuthPhase = "loading" | "authenticated" | "unauthenticated";

type LoginPayload = { login: string; password: string };
type RegisterPayload = { username: string; displayName: string; password: string; email?: string };

type AuthContextValue = {
  authPhase: AuthPhase;
  isCheckingSession: boolean;
  currentUser: AuthUser | null;
  sessionExpired: boolean;
  authMessage: string;
  authSystemError: string;
  googleOAuthEnabled: boolean;
  login: (payload: LoginPayload) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  logout: () => Promise<void>;
  startGoogleAuth: () => void;
  expireSession: () => void;
  withAuth: <T>(operation: () => Promise<T>) => Promise<T>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function parseAuthErrorMessage() {
  const params = new URLSearchParams(window.location.search);
  const authError = params.get("authError");
  if (!authError) return "";

  const authMessages: Record<string, string> = {
    google_cancelled: "Вход через Google был отменен.",
    google_missing_code: "Google не вернул код авторизации.",
    google_invalid_state: "Безопасность входа не подтвердилась. Повторите попытку.",
    google_not_configured: "Вход через Google временно недоступен.",
    google_token_exchange_failed: "Не удалось завершить вход через Google.",
    google_email_not_verified: "Google не подтвердил email.",
    google_email_conflict: "Этот email уже связан с другим аккаунтом.",
    google_link_conflict: "Этот Google-аккаунт уже связан с другим пользователем.",
    google_network_error: "Сетевая ошибка при входе через Google.",
    google_auth_failed: "Не удалось выполнить вход через Google.",
  };

  const message = authMessages[authError] || "Не удалось выполнить вход через Google.";
  params.delete("authError");
  const nextUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}${window.location.hash}`;
  window.history.replaceState({}, document.title, nextUrl);
  return message;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [authPhase, setAuthPhase] = useState<AuthPhase>("loading");
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const [authSystemError, setAuthSystemError] = useState("");
  const [googleOAuthEnabled, setGoogleOAuthEnabled] = useState(false);

  const expireSession = useCallback(() => {
    setCurrentUser(null);
    setAuthPhase("unauthenticated");
    setSessionExpired(true);
  }, []);

  const withAuth = useCallback(
    async <T,>(operation: () => Promise<T>) => {
      try {
        return await operation();
      } catch (error) {
        if (isApiError(error) && error.status === 401) {
          expireSession();
        }
        throw error;
      }
    },
    [expireSession],
  );

  useEffect(() => {
    setAuthMessage(parseAuthErrorMessage());
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setAuthPhase("loading");
    setIsCheckingSession(true);
    setAuthSystemError("");

    void (async () => {
      try {
        const [providersResult, userResult] = await Promise.allSettled([
          getAuthProviders(controller.signal),
          getCurrentUser(controller.signal),
        ]);

        if (controller.signal.aborted) return;

        setGoogleOAuthEnabled(providersResult.status === "fulfilled" ? providersResult.value.googleOAuthEnabled : false);

        if (userResult.status === "fulfilled") {
          setCurrentUser(userResult.value.user);
          setAuthPhase("authenticated");
          setSessionExpired(false);
          return;
        }

        if (isApiError(userResult.reason) && userResult.reason.status === 401) {
          setCurrentUser(null);
          setAuthPhase("unauthenticated");
          return;
        }

        setCurrentUser(null);
        setAuthPhase("unauthenticated");
        setAuthSystemError("Не удалось загрузить сессию.");
      } catch (error) {
        if (controller.signal.aborted) return;
        if (isApiError(error) && error.status === 401) {
          setCurrentUser(null);
          setAuthPhase("unauthenticated");
          return;
        }

        setCurrentUser(null);
        setAuthPhase("unauthenticated");
        setAuthSystemError("Не удалось загрузить сессию.");
      } finally {
        if (!controller.signal.aborted) {
          setIsCheckingSession(false);
        }
      }
    })();

    return () => controller.abort();
  }, []);

  const login = useCallback(async (payload: LoginPayload) => {
    const response = await loginApi(payload);
    setCurrentUser(response.user);
    setAuthPhase("authenticated");
    setSessionExpired(false);
    setAuthMessage("");
    setAuthSystemError("");
  }, []);

  const register = useCallback(async (payload: RegisterPayload) => {
    const response = await registerApi(payload);
    setCurrentUser(response.user);
    setAuthPhase("authenticated");
    setSessionExpired(false);
    setAuthMessage("");
    setAuthSystemError("");
  }, []);

  const logout = useCallback(async () => {
    try {
      await logoutApi();
    } finally {
      setCurrentUser(null);
      setAuthPhase("unauthenticated");
      setSessionExpired(false);
      setAuthMessage("");
      setAuthSystemError("");
    }
  }, []);

  const startGoogleAuth = useCallback(() => {
    window.location.assign("/api/auth/google");
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      authPhase,
      isCheckingSession,
      currentUser,
      sessionExpired,
      authMessage,
      authSystemError,
      googleOAuthEnabled,
      login,
      register,
      logout,
      startGoogleAuth,
      expireSession,
      withAuth,
    }),
    [
      authPhase,
      isCheckingSession,
      currentUser,
      sessionExpired,
      authMessage,
      authSystemError,
      googleOAuthEnabled,
      login,
      register,
      logout,
      startGoogleAuth,
      expireSession,
      withAuth,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
