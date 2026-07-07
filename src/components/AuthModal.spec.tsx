import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import AuthModal from "./AuthModal";

describe("AuthModal", () => {
  it("submits registration with age acknowledgement when public registration is enabled", async () => {
    const user = userEvent.setup();
    const onRegister = vi.fn().mockResolvedValue(undefined);

    render(
      <AuthModal
        onLogin={vi.fn()}
        onRegister={onRegister}
        onGoogleAuth={vi.fn()}
        currentUser={null}
        onLogout={vi.fn()}
        publicRegistrationEnabled
        googleOAuthEnabled
      />,
    );

    await user.click(screen.getByRole("button", { name: "Создать новый аккаунт" }));
    await user.type(screen.getByLabelText("ЛОГИН"), "new-user");
    await user.type(screen.getByLabelText("DISPLAY NAME"), "New User");
    await user.type(screen.getByLabelText("EMAIL"), "new@example.com");
    await user.type(screen.getByLabelText("ПАРОЛЬ"), "123456789012");
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Зарегистрироваться" }));

    await waitFor(() => {
      expect(onRegister).toHaveBeenCalledWith({
        username: "new-user",
        displayName: "New User",
        email: "new@example.com",
        password: "123456789012",
        ageAcknowledged: true,
      });
    });
  });

  it("does not show registration toggle when public registration is disabled", () => {
    render(
      <AuthModal
        onLogin={vi.fn()}
        onRegister={vi.fn()}
        onGoogleAuth={vi.fn()}
        currentUser={null}
        onLogout={vi.fn()}
        publicRegistrationEnabled={false}
        googleOAuthEnabled
      />,
    );

    expect(screen.queryByRole("button", { name: "Создать новый аккаунт" })).toBeNull();
    expect(screen.getByText(/Публичная регистрация сейчас закрыта/i)).toBeInTheDocument();
  });
});
