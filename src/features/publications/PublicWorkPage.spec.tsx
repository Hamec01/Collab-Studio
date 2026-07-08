import { render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { getPublicWork } from "../../api/publications";
import PublicWorkPage from "./PublicWorkPage";

vi.mock("../../api/publications", () => ({
  getPublicWork: vi.fn(),
  likeWork: vi.fn(),
  unlikeWork: vi.fn(),
  playWork: vi.fn(),
}));

vi.mock("../../app/auth/AuthProvider", () => ({
  useAuth: () => ({ currentUser: null }),
}));

describe("PublicWorkPage", () => {
  it("renders a public work with native audio and safe author link", async () => {
    vi.mocked(getPublicWork).mockResolvedValue({
      work: {
        id: "pub-1",
        slug: "neon-lights",
        kind: "WORK",
        title: "Neon Lights",
        description: "Public release.",
        coverImageUrl: "https://example.com/cover.jpg",
        tags: ["pop"],
        language: "ru",
        publishedAt: "2026-07-08T00:00:00.000Z",
        expiresAt: null,
        likeCount: 0,
        playCount: 0,
        hasLiked: false,
        author: {
          displayName: "Hamilio",
          username: "hamilio",
          avatarUrl: null,
          publicProfileUrl: "/u/hamilio",
        },
        lyrics: {
          snapshotId: "snap-1",
          title: "Snapshot",
          plainText: "line one",
        },
        audio: {
          originalFilename: "demo.wav",
          mimeType: "audio/wav",
          sizeBytes: 8,
          durationMs: 1200,
          streamUrl: "/api/public/works/neon-lights/stream",
          downloadUrl: "/api/public/works/neon-lights/download",
        },
      },
    });

    render(
      <MemoryRouter initialEntries={["/works/neon-lights"]}>
        <Routes>
          <Route path="/works/:slug" element={<PublicWorkPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => expect(getPublicWork).toHaveBeenCalledWith("neon-lights", expect.any(AbortSignal)));
    expect(screen.getByRole("heading", { name: "Neon Lights" })).toBeInTheDocument();
    expect(screen.getByText("Public release.")).toBeInTheDocument();
    expect(screen.getByText("line one")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "@hamilio" })).toHaveAttribute("href", "/u/hamilio");
    expect(screen.getByRole("link", { name: "Скачать аудио" })).toHaveAttribute("href", "/api/public/works/neon-lights/download");
  });
});

