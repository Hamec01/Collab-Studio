import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Annotation, PlayableAudioSource } from "../types";

const mockedPlayer = {
  selectedAudioSourceId: "asset-1",
  setSelectedAudioSourceId: vi.fn(),
  syncSelectedAudioSource: vi.fn(),
  audioElement: null,
  isPlaying: false,
  currentTime: 0,
  duration: 60,
  volume: 0.8,
  playbackRate: 1,
  sourceUrl: "/audio/demo.wav",
  play: vi.fn().mockResolvedValue(undefined),
  pause: vi.fn(),
  togglePlay: vi.fn().mockResolvedValue(undefined),
  seekTo: vi.fn(),
  setVolume: vi.fn(),
  setPlaybackRate: vi.fn(),
  loadSource: vi.fn(),
};

vi.mock("../app/player/PlayerProvider", () => ({
  usePlayer: () => mockedPlayer,
  PlayerProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import AudioPlayer from "./AudioPlayer";

function makeSource(overrides: Partial<PlayableAudioSource> = {}): PlayableAudioSource {
  return {
    sourceType: overrides.sourceType ?? "asset",
    id: overrides.id ?? "asset-1",
    trackAssetId: overrides.trackAssetId ?? "asset-1",
    legacyAudioVersionId: overrides.legacyAudioVersionId ?? null,
    versionNumber: overrides.versionNumber ?? 1,
    title: overrides.title ?? "Demo",
    originalFilename: overrides.originalFilename ?? "demo.wav",
    streamUrl: "streamUrl" in overrides ? overrides.streamUrl ?? null : "/audio/demo.wav",
    downloadUrl: "downloadUrl" in overrides ? overrides.downloadUrl ?? null : "/audio/demo.wav/download",
    externalUrl: "externalUrl" in overrides ? overrides.externalUrl ?? null : null,
    externalProvider: overrides.externalProvider ?? null,
    mimeType: overrides.mimeType ?? "audio/wav",
    durationMs: overrides.durationMs ?? 12000,
    isPrimary: overrides.isPrimary ?? true,
    createdAt: overrides.createdAt ?? "2026-07-06T10:00:00.000Z",
    uploadedBy: overrides.uploadedBy ?? { id: "u1", displayName: "Uploader", avatarUrl: null },
    canDelete: overrides.canDelete ?? true,
    supportsTimestampAnnotations: overrides.supportsTimestampAnnotations ?? true,
  };
}

function makeAnnotation(overrides: Partial<Annotation> = {}): Annotation {
  return {
    id: overrides.id ?? "annotation-1",
    trackAssetId: overrides.trackAssetId ?? "asset-1",
    authorId: overrides.authorId ?? "u1",
    author: overrides.author ?? "Owner",
    authorUser: overrides.authorUser ?? { id: "u1", username: "owner", displayName: "Owner", avatarUrl: null },
    timestampSeconds: overrides.timestampSeconds ?? 23,
    text: overrides.text ?? "Seek note",
    createdAt: overrides.createdAt ?? "2026-07-06T10:00:00.000Z",
  };
}

describe("AudioPlayer annotation seek", () => {
  beforeEach(() => {
    mockedPlayer.isPlaying = false;
    mockedPlayer.currentTime = 0;
    mockedPlayer.sourceUrl = "/audio/demo.wav";
    mockedPlayer.seekTo.mockReset();
    mockedPlayer.play.mockReset().mockResolvedValue(undefined);
    Object.defineProperty(window.HTMLMediaElement.prototype, "load", { configurable: true, value: vi.fn() });
    Object.defineProperty(window.HTMLMediaElement.prototype, "pause", { configurable: true, value: vi.fn() });
    Object.defineProperty(window.HTMLMediaElement.prototype, "play", { configurable: true, value: vi.fn().mockResolvedValue(undefined) });
  });

  it("clicking an annotation seeks shared playback engine", async () => {
    const user = userEvent.setup();
    render(
      <AudioPlayer
        audioSources={[makeSource()]}
        annotations={[makeAnnotation()]}
        onAddAnnotation={vi.fn()}
        onSelectAudioSource={vi.fn()}
        selectedAudioSourceId="asset-1"
        canAnnotate
      />
    );

    await user.click(screen.getByRole("button", { name: "Показать заметки" }));
    await user.click(screen.getByRole("button", { name: "Перейти к таймкоду 0:23" }));

    expect(mockedPlayer.seekTo).toHaveBeenCalledWith(23);
    expect(mockedPlayer.play).toHaveBeenCalled();
  });
});
