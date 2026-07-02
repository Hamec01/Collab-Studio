import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../api/client";
import { AuthProvider, useAuth } from "./AuthProvider";

vi.mock("../../api/auth", () => ({
  getAuthProviders: vi.fn(),
  getCurrentUser: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
}));

import { getAuthProviders, getCurrentUser, login, logout, register } from "../../api/auth";

const getAuthProvidersMock = vi.mocked(getAuthProviders);
const getCurrentUserMock = vi.mocked(getCurrentUser);
const loginMock = vi.mocked(login);
const registerMock = vi.mocked(register);
const logoutMock = vi.mocked(logout);

function makeUser(id: string) {
  return {
    id,
    username: `${id}-username`,
    displayName: `${id}-display`,
    role: "user" as const,
    email: null,
    avatarUrl: null,
    createdAt: "2026-07-02T00:00:00.000Z",
    updatedAt: "2026-07-02T00:00:00.000Z",
  };
}

function AuthProbe() {
  const auth = useAuth();

  return (
    <div>
      <div data-testid="phase">{auth.authPhase}</div>
      <div data-testid="loading">{String(auth.isCheckingSession)}</div>
      <div data-testid="user">{auth.currentUser?.id ?? "none"}</div>
      <div data-testid="expired">{String(auth.sessionExpired)}</div>
      <button
        onClick={() => {
          void auth.withAuth(async () => {
            throw new ApiError("Authentication required", 401, "HTTP_401");
          }).catch(() => undefined);
        }}
      >
        trigger-401
      </button>
      <button
        onClick={() => {
          void auth.logout();
        }}
      >
        logout
      </button>
    </div>
  );
}

describe("AuthProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthProvidersMock.mockResolvedValue({ googleOAuthEnabled: true });
    loginMock.mockResolvedValue({ user: makeUser("u-login") });
    registerMock.mockResolvedValue({ user: makeUser("u-reg") });
    logoutMock.mockResolvedValue({ success: true });
    window.history.replaceState({}, "", "/app");
  });

  it("bootstraps current user", async () => {
    getCurrentUserMock.mockResolvedValue({ user: makeUser("u1") });

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("phase").textContent).toBe("authenticated"));
    expect(screen.getByTestId("user").textContent).toBe("u1");
    expect(screen.getByTestId("loading").textContent).toBe("false");
  });

  it("enters unauthenticated state when bootstrap returns 401", async () => {
    getCurrentUserMock.mockRejectedValue(new ApiError("Authentication required", 401, "HTTP_401"));

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("phase").textContent).toBe("unauthenticated"));
    expect(screen.getByTestId("user").textContent).toBe("none");
    expect(screen.getByTestId("expired").textContent).toBe("false");
  });

  it("marks session expired on centralized 401 handling", async () => {
    const user = userEvent.setup();
    getCurrentUserMock.mockResolvedValue({ user: makeUser("u1") });

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("phase").textContent).toBe("authenticated"));

    await user.click(screen.getByRole("button", { name: "trigger-401" }));

    await waitFor(() => expect(screen.getByTestId("phase").textContent).toBe("unauthenticated"));
    expect(screen.getByTestId("expired").textContent).toBe("true");
    expect(screen.getByTestId("user").textContent).toBe("none");
  });

  it("logout clears auth state", async () => {
    const user = userEvent.setup();
    getCurrentUserMock.mockResolvedValue({ user: makeUser("u1") });

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("phase").textContent).toBe("authenticated"));

    await user.click(screen.getByRole("button", { name: "logout" }));

    await waitFor(() => expect(screen.getByTestId("phase").textContent).toBe("unauthenticated"));
    expect(screen.getByTestId("user").textContent).toBe("none");
    expect(screen.getByTestId("expired").textContent).toBe("false");
  });
});
