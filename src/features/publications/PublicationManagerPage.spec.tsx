import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { createWorkPublication, archivePublication, getMyPublications } from "../../api/publications";
import { listProjects } from "../../api/projects";
import { AuthProvider } from "../../app/auth/AuthProvider";
import { I18nProvider } from "../../app/i18n/I18nProvider";
import PublicationManagerPage from "./PublicationManagerPage";

vi.mock("../../api/publications", () => ({
  getMyPublications: vi.fn(),
  createWorkPublication: vi.fn(),
  archivePublication: vi.fn(),
}));

vi.mock("../../api/projects", () => ({
  listProjects: vi.fn(),
}));

vi.mock("../../api/auth", () => ({
  getAuthProviders: vi.fn().mockResolvedValue({
    googleOAuthEnabled: false,
    publicRegistrationEnabled: false,
  }),
  getCurrentUser: vi.fn().mockResolvedValue({
    user: {
      id: "user-1",
      username: "hamilio",
      displayName: "Hamilio",
      avatarUrl: null,
      email: "hamilio@example.com",
      role: "user",
      isPublicProfile: true,
      bio: null,
      location: null,
      website: null,
      createdAt: "2026-07-08T00:00:00.000Z",
      updatedAt: "2026-07-08T00:00:00.000Z",
    },
  }),
  login: vi.fn(),
  logout: vi.fn(),
  register: vi.fn(),
  acknowledgeAge: vi.fn(),
  confirmEmailVerification: vi.fn(),
}));

vi.mock("../../utils/swMessages", () => ({
  clearSwCachesOnLogout: vi.fn().mockResolvedValue(undefined),
}));

describe("PublicationManagerPage", () => {
  it("creates and archives a work publication from an editor-owned track", async () => {
    vi.mocked(listProjects).mockResolvedValue([
      {
        id: "project-1",
        title: "Album",
        type: "album",
        coverUrl: null,
        tags: [],
        currentUserRole: "owner",
        owner: null,
        participants: [],
        members: [],
        chat: [],
        tasks: [],
        activity: [],
        createdAt: "2026-07-08T00:00:00.000Z",
        updatedAt: "2026-07-08T00:00:00.000Z",
        tracks: [
          {
            id: "track-1",
            title: "Song A",
            lyrics: "",
            lyricsRevision: 0,
            tags: [],
            versionHistory: [],
            lyricVersions: [],
            audioVersions: [],
            assets: [
              {
                id: "asset-1",
                trackId: "track-1",
                projectId: "project-1",
                uploadedByUserId: null,
                kind: "AUDIO_VERSION",
                status: "READY",
                title: null,
                originalFilename: "song-a.wav",
                storageProvider: "local",
                externalUrl: null,
                externalProvider: null,
                mimeType: "audio/wav",
                sizeBytes: 8,
                durationMs: 1200,
                waveformData: null,
                metadata: {},
                sourceAssetId: null,
                legacyAudioVersionId: null,
                versionNumber: 1,
                isPrimary: true,
                createdAt: "2026-07-08T00:00:00.000Z",
                updatedAt: "2026-07-08T00:00:00.000Z",
                deletedAt: null,
                streamUrl: "/api/projects/project-1/tracks/track-1/assets/asset-1/stream",
                downloadUrl: "/api/projects/project-1/tracks/track-1/assets/asset-1/download",
                uploadedBy: null,
              },
            ],
            comments: [],
            lyricsDiscussions: [],
            chat: [],
            tasks: [],
            annotations: [],
            createdAt: "2026-07-08T00:00:00.000Z",
            updatedAt: "2026-07-08T00:00:00.000Z",
          },
        ],
      },
    ]);
    vi.mocked(getMyPublications).mockResolvedValue({
      publications: [],
    });
    vi.mocked(createWorkPublication).mockResolvedValue({
      publication: {
        id: "pub-1",
        kind: "WORK",
        status: "PUBLISHED",
        slug: "song-a-public",
        title: "Song A Public",
        description: "description",
        coverImageUrl: null,
        tags: [],
        language: null,
        projectId: "project-1",
        projectTitle: "Album",
        trackId: "track-1",
        trackTitle: "Song A",
        snapshotId: "snap-1",
        selectedAssetId: "asset-1",
        publicUrl: "/works/song-a-public",
        streamUrl: "/api/public/works/song-a-public/stream",
        downloadUrl: "/api/public/works/song-a-public/download",
        publishedAt: "2026-07-08T00:00:00.000Z",
        expiresAt: null,
        archivedAt: null,
        createdAt: "2026-07-08T00:00:00.000Z",
        updatedAt: "2026-07-08T00:00:00.000Z",
        likeCount: 0,
        playCount: 0,
        hasLiked: false,
        author: {
          displayName: "Hamilio",
          username: "hamilio",
          avatarUrl: null,
          publicProfileUrl: "/u/hamilio",
        },
        lyrics: null,
      },
    });
    vi.mocked(archivePublication).mockResolvedValue({
      publication: {
        id: "pub-1",
        kind: "WORK",
        status: "ARCHIVED",
        slug: "song-a-public",
        title: "Song A Public",
        description: "description",
        coverImageUrl: null,
        tags: [],
        language: null,
        projectId: "project-1",
        projectTitle: "Album",
        trackId: "track-1",
        trackTitle: "Song A",
        snapshotId: "snap-1",
        selectedAssetId: "asset-1",
        publicUrl: "/works/song-a-public",
        streamUrl: "/api/public/works/song-a-public/stream",
        downloadUrl: "/api/public/works/song-a-public/download",
        publishedAt: "2026-07-08T00:00:00.000Z",
        expiresAt: null,
        archivedAt: "2026-07-08T01:00:00.000Z",
        createdAt: "2026-07-08T00:00:00.000Z",
        updatedAt: "2026-07-08T01:00:00.000Z",
        likeCount: 0,
        playCount: 0,
        hasLiked: false,
        author: {
          displayName: "Hamilio",
          username: "hamilio",
          avatarUrl: null,
          publicProfileUrl: "/u/hamilio",
        },
        lyrics: null,
      },
    });

    render(
      <I18nProvider>
        <AuthProvider>
          <MemoryRouter initialEntries={["/app/publications"]}>
            <Routes>
              <Route path="/app/publications" element={<PublicationManagerPage />} />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </I18nProvider>,
    );

    await waitFor(() => expect(listProjects).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText("Track"), { target: { value: "track-1" } });
    fireEvent.change(screen.getByLabelText("Publication title"), { target: { value: "Song A Public" } });
    fireEvent.click(screen.getByRole("button", { name: "Создать work publication" }));

    await waitFor(() => expect(createWorkPublication).toHaveBeenCalledWith({
      projectId: "project-1",
      trackId: "track-1",
      title: "Song A Public",
      description: undefined,
      coverImageUrl: undefined,
      language: undefined,
      tags: [],
    }));

    expect(await screen.findByText("Публикация Work создана.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Архивировать" }));
    await waitFor(() => expect(archivePublication).toHaveBeenCalledWith("pub-1"));
    expect(await screen.findByText("Публикация архивирована.")).toBeInTheDocument();
  });
});
