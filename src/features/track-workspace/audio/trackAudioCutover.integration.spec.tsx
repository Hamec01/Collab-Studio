import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AudioPlayer from "../../../components/AudioPlayer";
import { PlayerProvider } from "../../../app/player/PlayerProvider";
import type { Track } from "../../../types";
import { normalizeTrackAudio, resolveSelectedAudioSource } from "./normalizeTrackAudio";

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: overrides.id ?? "track-1",
    title: overrides.title ?? "Track 1",
    lyrics: overrides.lyrics ?? "",
    lyricsRevision: overrides.lyricsRevision ?? 1,
    tags: overrides.tags ?? [],
    versionHistory: overrides.versionHistory ?? [],
    lyricVersions: overrides.lyricVersions ?? [],
    audioVersions: overrides.audioVersions ?? [],
    assets: overrides.assets ?? [],
    comments: overrides.comments ?? [],
    lyricsDiscussions: overrides.lyricsDiscussions ?? [],
    chat: overrides.chat ?? [],
    tasks: overrides.tasks ?? [],
    annotations: overrides.annotations ?? [],
    createdAt: overrides.createdAt ?? "2026-07-06T10:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-07-06T10:00:00.000Z",
  };
}

function renderTrack(track: Track, selectedId: string | null) {
  const normalized = normalizeTrackAudio(track, selectedId);
  return render(
    <AudioPlayer
      audioSources={normalized.sources}
      annotations={track.annotations}
      onAddAnnotation={vi.fn()}
      onSelectAudioSource={vi.fn()}
      selectedAudioSourceId={normalized.current?.id ?? null}
      canAnnotate
    />,
    { wrapper: ({ children }: { children: React.ReactNode }) => <PlayerProvider>{children}</PlayerProvider> }
  );
}

describe("Stage 5A slice 7 frontend audio integration", () => {
  beforeEach(() => {
    Object.defineProperty(window.HTMLMediaElement.prototype, "load", {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(window.HTMLMediaElement.prototype, "pause", {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(window.HTMLMediaElement.prototype, "play", {
      configurable: true,
      value: vi.fn().mockResolvedValue(undefined),
    });
  });

  it("prefers mapped asset urls after refetch and removes deleted legacy-linked rows on next refetch", () => {
    const initialTrack = makeTrack({
      audioVersions: [
        {
          id: "audio-1",
          originalFilename: "demo-v1.wav",
          mimeType: "audio/wav",
          sizeBytes: 100,
          durationSeconds: 12,
          versionNumber: 1,
          uploadedBy: { id: "u1", displayName: "Owner", avatarUrl: null },
          createdAt: "2026-07-06T10:00:00.000Z",
          streamUrl: "/api/projects/p1/tracks/t1/audio/audio-1/stream",
          isExternal: false,
          externalUrl: null,
          externalProvider: null,
        },
      ],
    });

    const dualWrittenTrack = makeTrack({
      audioVersions: [
        ...initialTrack.audioVersions,
        {
          id: "audio-2",
          originalFilename: "demo-v2.wav",
          mimeType: "audio/wav",
          sizeBytes: 120,
          durationSeconds: 14,
          versionNumber: 2,
          uploadedBy: { id: "u1", displayName: "Owner", avatarUrl: null },
          createdAt: "2026-07-06T11:00:00.000Z",
          streamUrl: "/api/projects/p1/tracks/t1/audio/audio-2/stream",
          isExternal: false,
          externalUrl: null,
          externalProvider: null,
        },
      ],
      assets: [
        {
          id: "asset-2",
          trackId: "t1",
          projectId: "p1",
          uploadedByUserId: "u1",
          kind: "AUDIO_VERSION",
          status: "READY",
          title: null,
          originalFilename: "demo-v2.wav",
          storageProvider: "local",
          externalUrl: null,
          externalProvider: null,
          mimeType: "audio/wav",
          sizeBytes: 120,
          durationMs: 14000,
          waveformData: null,
          metadata: {},
          sourceAssetId: null,
          legacyAudioVersionId: "audio-2",
          versionNumber: 2,
          isPrimary: true,
          createdAt: "2026-07-06T11:00:00.000Z",
          updatedAt: "2026-07-06T11:00:00.000Z",
          deletedAt: null,
          streamUrl: "/api/projects/p1/tracks/t1/assets/asset-2/stream",
          downloadUrl: "/api/projects/p1/tracks/t1/assets/asset-2/download",
          uploadedBy: { id: "u1", displayName: "Owner", avatarUrl: null },
        },
      ],
    });

    renderTrack(initialTrack, null);

    // Verify player UI renders with first legacy audio
    expect(screen.getByRole("button", { name: /воспроизвести|пауза/i })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Выбор версии аудио" })).toBeInTheDocument();

    const normalizedAfterRefetch = normalizeTrackAudio(dualWrittenTrack, null);
    expect(normalizedAfterRefetch.sources.map((source) => source.id)).toEqual(["asset-2", "audio-1"]);
    expect(normalizedAfterRefetch.current?.id).toBe("asset-2");

    // Verifies that asset takes precedence over legacy in source order
    expect(normalizedAfterRefetch.sources[0].sourceType).toBe("asset");
  });
});
