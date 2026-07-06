import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { StickyAudioPlayer } from "./StickyAudioPlayer";
import { PlayerProvider } from "../app/player/PlayerProvider";
import type { PlayableAudioSource } from "../types";

const mockSelectedAudio: PlayableAudioSource = {
  id: "audio-1",
  trackAssetId: "asset-1",
  legacyAudioVersionId: null,
  versionNumber: 1,
  title: "Test Audio",
  originalFilename: "test-audio.mp3",
  streamUrl: "https://example.com/audio.mp3",
  downloadUrl: "https://example.com/audio.mp3?download=1",
  externalUrl: null,
  externalProvider: null,
  mimeType: "audio/mpeg",
  durationMs: 120000,
  isPrimary: true,
  createdAt: "2026-07-06T12:00:00.000Z",
  uploadedBy: null,
  canDelete: true,
  supportsTimestampAnnotations: true,
  sourceType: "asset",
};

describe("StickyAudioPlayer", () => {
  it("renders nothing when no playable source", () => {
    const { container } = render(
      <PlayerProvider>
        <StickyAudioPlayer
          trackTitle="Test Track"
          selectedAudio={null}
          onOpenTrack={vi.fn()}
        />
      </PlayerProvider>
    );

    expect(container.firstChild).toBeNull();
  });

  it("renders mini player with track info when source is loaded", () => {
    render(
      <PlayerProvider>
        <StickyAudioPlayer
          trackTitle="My Awesome Track"
          selectedAudio={mockSelectedAudio}
          onOpenTrack={vi.fn()}
        />
      </PlayerProvider>
    );

    expect(screen.getByText("My Awesome Track")).toBeInTheDocument();
    expect(screen.getByText("test-audio.mp3")).toBeInTheDocument();
  });

  it("calls onOpenTrack when track info is clicked", () => {
    const onOpenTrack = vi.fn();
    
    render(
      <PlayerProvider>
        <StickyAudioPlayer
          trackTitle="My Track"
          selectedAudio={mockSelectedAudio}
          onOpenTrack={onOpenTrack}
        />
      </PlayerProvider>
    );

    const trackButton = screen.getByRole("button", { name: /открыть трек/i });
    fireEvent.click(trackButton);

    expect(onOpenTrack).toHaveBeenCalledTimes(1);
  });

  it("displays play button when not playing", () => {
    render(
      <PlayerProvider>
        <StickyAudioPlayer
          trackTitle="My Track"
          selectedAudio={mockSelectedAudio}
          onOpenTrack={vi.fn()}
        />
      </PlayerProvider>
    );

    const playButton = screen.getByRole("button", { name: "Воспроизвести" });
    expect(playButton).toBeInTheDocument();
  });

  it("displays formatted time correctly", () => {
    render(
      <PlayerProvider>
        <StickyAudioPlayer
          trackTitle="My Track"
          selectedAudio={mockSelectedAudio}
          onOpenTrack={vi.fn()}
        />
      </PlayerProvider>
    );

    // Should show 0:00 / 0:00 initially
    const timeElements = screen.getAllByText("0:00");
    expect(timeElements.length).toBeGreaterThan(0);
  });
});
