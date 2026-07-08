import { render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { getPublicProfile } from "../../api/profile";
import PublicProfilePage from "./PublicProfilePage";

vi.mock("../../api/profile", () => ({
  getPublicProfile: vi.fn(),
}));

describe("PublicProfilePage", () => {
  it("renders a public opt-in profile without private fields", async () => {
    vi.mocked(getPublicProfile).mockResolvedValue({
      profile: {
        id: "user-1",
        username: "hamilio",
        displayName: "Hamilio",
        avatarUrl: null,
        bio: "Автор и артист.",
        location: "Berlin",
        website: "https://example.com",
        createdAt: "2026-07-08T00:00:00.000Z",
        updatedAt: "2026-07-08T00:00:00.000Z",
      },
    });

    render(
      <MemoryRouter initialEntries={["/u/hamilio"]}>
        <Routes>
          <Route path="/u/:handle" element={<PublicProfilePage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => expect(getPublicProfile).toHaveBeenCalledWith("hamilio", expect.any(AbortSignal)));
    expect(screen.getByRole("heading", { name: "Hamilio" })).toBeInTheDocument();
    expect(screen.getByText("@hamilio")).toBeInTheDocument();
    expect(screen.getByText("Автор и артист.")).toBeInTheDocument();
    expect(screen.getByText("Berlin")).toBeInTheDocument();
    expect(screen.queryByText(/inkeritm@gmail.com/i)).toBeNull();
  });
});
