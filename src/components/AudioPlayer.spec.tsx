import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AudioPlayer from "./AudioPlayer";
import type { PlayableAudioSource } from "../types";

function makeSource(overrides: Partial<PlayableAudioSource> = {}): PlayableAudioSource {
  return {
    sourceType: overrides.sourceType ?? "legacy",
    id: overrides.id ?? "source-1",
    trackAssetId: overrides.trackAssetId ?? null,
    legacyAudioVersionId: overrides.legacyAudioVersionId ?? "legacy-1",
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
  };
}

describe("AudioPlayer", () => {
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

  it("uses legacy stream url for legacy-only sources", () => {
    const { container } = render(
      <AudioPlayer
        audioSources={[makeSource({ id: "legacy-1", sourceType: "legacy", streamUrl: "/legacy/stream" })]}
        annotations={[]}
        onAddAnnotation={vi.fn()}
        onSelectAudioSource={vi.fn()}
        selectedAudioSourceId="legacy-1"
        canAnnotate
      />,
    );

    const audio = container.querySelector("audio");
    expect(audio?.getAttribute("src")).toBe("/legacy/stream");
  });

  it("renders deduped asset-first options and uses asset stream url", () => {
    const { container } = render(
      <AudioPlayer
        audioSources={[makeSource({ id: "asset-1", sourceType: "asset", trackAssetId: "asset-1", legacyAudioVersionId: "legacy-1", streamUrl: "/assets/asset-1/stream" })]}
        annotations={[]}
        onAddAnnotation={vi.fn()}
        onSelectAudioSource={vi.fn()}
        selectedAudioSourceId="asset-1"
        canAnnotate
      />,
    );

    const audio = container.querySelector("audio");
    expect(audio?.getAttribute("src")).toBe("/assets/asset-1/stream");
    const versionSelect = screen.getByRole("combobox", { name: "Выбор версии аудио" });
    expect(versionSelect.querySelectorAll("option")).toHaveLength(1);
  });

  it("supports native-only asset sources", () => {
    const { container } = render(
      <AudioPlayer
        audioSources={[makeSource({ id: "native-1", sourceType: "asset", trackAssetId: "native-1", legacyAudioVersionId: null, streamUrl: "/assets/native-1/stream" })]}
        annotations={[]}
        onAddAnnotation={vi.fn()}
        onSelectAudioSource={vi.fn()}
        selectedAudioSourceId="native-1"
        canAnnotate
      />,
    );

    expect(container.querySelector("audio")?.getAttribute("src")).toBe("/assets/native-1/stream");
  });

  it("switches source when another version is selected", async () => {
    const user = userEvent.setup();
    const onSelectAudioSource = vi.fn();
    const { rerender, container } = render(
      <AudioPlayer
        audioSources={[makeSource({ id: "v1", streamUrl: "/audio/v1" }), makeSource({ id: "v2", streamUrl: "/audio/v2", versionNumber: 2, isPrimary: false })]}
        annotations={[]}
        onAddAnnotation={vi.fn()}
        onSelectAudioSource={onSelectAudioSource}
        selectedAudioSourceId="v1"
        canAnnotate
      />,
    );

    await user.selectOptions(screen.getByRole("combobox", { name: "Выбор версии аудио" }), "v2");
    expect(onSelectAudioSource).toHaveBeenCalledWith("v2");

    rerender(
      <AudioPlayer
        audioSources={[makeSource({ id: "v1", streamUrl: "/audio/v1" }), makeSource({ id: "v2", streamUrl: "/audio/v2", versionNumber: 2, isPrimary: false })]}
        annotations={[]}
        onAddAnnotation={vi.fn()}
        onSelectAudioSource={onSelectAudioSource}
        selectedAudioSourceId="v2"
        canAnnotate
      />,
    );

    expect(container.querySelector("audio")?.getAttribute("src")).toBe("/audio/v2");
  });

  it("clears stale source when track becomes empty", () => {
    const { rerender, container } = render(
      <AudioPlayer
        audioSources={[makeSource({ id: "v1", streamUrl: "/audio/v1" })]}
        annotations={[]}
        onAddAnnotation={vi.fn()}
        onSelectAudioSource={vi.fn()}
        selectedAudioSourceId="v1"
        canAnnotate
      />,
    );

    expect(container.querySelector("audio")).not.toBeNull();

    rerender(
      <AudioPlayer
        audioSources={[]}
        annotations={[]}
        onAddAnnotation={vi.fn()}
        onSelectAudioSource={vi.fn()}
        selectedAudioSourceId={null}
        canAnnotate
      />,
    );

    expect(container.querySelector("audio")).toBeNull();
    expect(screen.getAllByText("Аудио не загружено")).toHaveLength(2);
  });

  it("shows external action instead of local playback for external-only sources", () => {
    const { container } = render(
      <AudioPlayer
        audioSources={[makeSource({ id: "ext-1", streamUrl: null, downloadUrl: null, externalUrl: "https://example.com/audio.mp3", externalProvider: "other" })]}
        annotations={[]}
        onAddAnnotation={vi.fn()}
        onSelectAudioSource={vi.fn()}
        selectedAudioSourceId="ext-1"
        canAnnotate
      />,
    );

    expect(container.querySelector("audio")).toBeNull();
    const link = screen.getByRole("link", { name: "Открыть ссылку" });
    expect(link).toHaveAttribute("href", "https://example.com/audio.mp3");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });
});
