import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { updateProfileMe } from "../../api/profile";
import { useAuth } from "../../app/auth/AuthProvider";
import { I18nProvider } from "../../app/i18n/I18nProvider";
import ProfileSettingsPage from "./ProfileSettingsPage";

vi.mock("../../api/profile", () => ({
  updateProfileMe: vi.fn(),
}));

vi.mock("../../app/auth/AuthProvider", () => ({
  useAuth: vi.fn(),
}));

describe("ProfileSettingsPage", () => {
  it("saves public profile opt-in and updates current auth user", async () => {
    const user = userEvent.setup();
    const setCurrentUserProfile = vi.fn();

    vi.mocked(useAuth).mockReturnValue({
      authPhase: "authenticated",
      currentUser: {
        id: "user-1",
        username: "hamilio",
        displayName: "Hamilio",
        avatarUrl: null,
        email: "user@example.com",
        role: "user",
        isPublicProfile: false,
        bio: null,
        location: null,
        website: null,
        createdAt: "2026-07-08T00:00:00.000Z",
        updatedAt: "2026-07-08T00:00:00.000Z",
      },
      isCheckingSession: false,
      sessionExpired: false,
      authMessage: "",
      authSystemError: "",
      googleOAuthEnabled: true,
      publicRegistrationEnabled: true,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      startGoogleAuth: vi.fn(),
      acknowledgeAge: vi.fn(),
      setCurrentUserProfile,
      expireSession: vi.fn(),
      withAuth: (operation: () => Promise<unknown>) => operation(),
    });

    vi.mocked(updateProfileMe).mockResolvedValue({
      user: {
        id: "user-1",
        username: "hamilio",
        displayName: "Hamilio Updated",
        avatarUrl: null,
        email: "user@example.com",
        role: "user",
        isPublicProfile: true,
        bio: "New bio",
        location: "Berlin",
        website: "https://example.com",
        createdAt: "2026-07-08T00:00:00.000Z",
        updatedAt: "2026-07-08T01:00:00.000Z",
      },
    });

    render(
      <I18nProvider>
        <MemoryRouter>
          <ProfileSettingsPage />
        </MemoryRouter>
      </I18nProvider>,
    );

    await user.clear(screen.getByLabelText("Display name"));
    await user.type(screen.getByLabelText("Display name"), "Hamilio Updated");
    await user.clear(screen.getByLabelText("Bio"));
    await user.type(screen.getByLabelText("Bio"), "New bio");
    await user.clear(screen.getByLabelText("Location"));
    await user.type(screen.getByLabelText("Location"), "Berlin");
    await user.clear(screen.getByLabelText("Website"));
    await user.type(screen.getByLabelText("Website"), "https://example.com");
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Сохранить профиль" }));

    await waitFor(() => {
      expect(updateProfileMe).toHaveBeenCalledWith({
        displayName: "Hamilio Updated",
        isPublicProfile: true,
        bio: "New bio",
        location: "Berlin",
        website: "https://example.com",
      });
    });
    expect(setCurrentUserProfile).toHaveBeenCalled();
    expect(await screen.findByText("Профиль сохранён.")).toBeInTheDocument();
  });
});
