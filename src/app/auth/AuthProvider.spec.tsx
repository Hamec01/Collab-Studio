import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../api/client";
import { AuthProvider, useAuth } from "./AuthProvider";

vi.mock("../../api/auth", () => ({
  acknowledgeAge: vi.fn(),
  confirmEmailVerification: vi.fn(),
  getAuthProviders: vi.fn(),
  getCurrentUser: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
}));

import { acknowledgeAge, confirmEmailVerification, getAuthProviders, getCurrentUser, login, logout, register } from "../../api/auth";

const acknowledgeAgeMock = vi.mocked(acknowledgeAge);
const confirmEmailVerificationMock = vi.mocked(confirmEmailVerification);
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
      <button onClick={() => { void auth.logout(); }}>logout</button>
      <button onClick={() => { void auth.register({ username: "new-user", displayName: "New User", email: "new@example.com", password: "123456789012", ageAcknowledged: true }); }}>register</button>
      <button onClick={() => { void auth.acknowledgeAge(); }}>ack-age</button>
    </div>
  );
}

describe("AuthProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthProvidersMock.mockResolvedValue({ googleOAuthEnabled: true, publicRegistrationEnabled: true });
    loginMock.mockResolvedValue({ user: makeUser("u-login") });
    registerMock.mockResolvedValue({ user: makeUser("u-reg"), verificationToken: "token-12345678901234567890" });
    confirmEmailVerificationMock.mockResolvedValue({ success: true });
    acknowledgeAgeMock.mockResolvedValue({ success: true, user: makeUser("u-age") });
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

  it("register auto-confirms email and refreshes current user", async () => {
    const user = userEvent.setup();
    getCurrentUserMock
      .mockResolvedValueOnce({ user: makeUser("bootstrap") })
      .mockResolvedValueOnce({ user: { ...makeUser("u-reg"), emailVerifiedAt: "2026-07-07T00:00:00.000Z" } });

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("phase").textContent).toBe("authenticated"));
    await user.click(screen.getByRole("button", { name: "register" }));
    await waitFor(() => expect(screen.getByTestId("user").textContent).toBe("u-reg"));
    expect(confirmEmailVerificationMock).toHaveBeenCalledWith("token-12345678901234567890");
  });

  it("acknowledges age and refreshes current user", async () => {
    const user = userEvent.setup();
    getCurrentUserMock.mockResolvedValue({ user: makeUser("u1") });

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("phase").textContent).toBe("authenticated"));
    await user.click(screen.getByRole("button", { name: "ack-age" }));
    await waitFor(() => expect(acknowledgeAgeMock).toHaveBeenCalled());
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
