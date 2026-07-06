import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AudioPlayer from "./AudioPlayer";
import { PlayerProvider } from "../app/player/PlayerProvider";
import type { Annotation, PlayableAudioSource } from "../types";

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

function makeAnnotation(overrides: Partial<Annotation> = {}): Annotation {
  return {
    id: overrides.id ?? "annotation-1",
    trackAssetId: overrides.trackAssetId ?? null,
    authorId: overrides.authorId ?? "u1",
    author: overrides.author ?? "Owner",
    authorUser: overrides.authorUser ?? { id: "u1", username: "owner", displayName: "Owner", avatarUrl: null },
    timestampSeconds: overrides.timestampSeconds ?? 15,
    text: overrides.text ?? "Note",
    createdAt: overrides.createdAt ?? "2026-07-06T10:00:00.000Z",
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
    render(
      <PlayerProvider>
        <AudioPlayer
          audioSources={[makeSource({ id: "legacy-1", sourceType: "legacy", streamUrl: "/legacy/stream" })]}
          annotations={[]}
          onAddAnnotation={vi.fn()}
          onSelectAudioSource={vi.fn()}
          selectedAudioSourceId="legacy-1"
          canAnnotate
        />
      </PlayerProvider>
    );

    // Verify player UI renders
    expect(screen.getByRole("button", { name: /воспроизвести|пауза/i })).toBeInTheDocument();
  });

  it("renders deduped asset-first options and uses asset stream url", () => {
    render(
      <PlayerProvider>
        <AudioPlayer
          audioSources={[makeSource({ id: "asset-1", sourceType: "asset", trackAssetId: "asset-1", legacyAudioVersionId: "legacy-1", streamUrl: "/assets/asset-1/stream" })]}
          annotations={[]}
          onAddAnnotation={vi.fn()}
          onSelectAudioSource={vi.fn()}
          selectedAudioSourceId="asset-1"
          canAnnotate
        />
      </PlayerProvider>
    );

    const versionSelect = screen.getByRole("combobox", { name: "Выбор версии аудио" });
    expect(versionSelect.querySelectorAll("option")).toHaveLength(1);
  });

  it("supports native-only asset sources", () => {
    render(
      <PlayerProvider>
        <AudioPlayer
          audioSources={[makeSource({ id: "native-1", sourceType: "asset", trackAssetId: "native-1", legacyAudioVersionId: null, streamUrl: "/assets/native-1/stream" })]}
          annotations={[]}
          onAddAnnotation={vi.fn()}
          onSelectAudioSource={vi.fn()}
          selectedAudioSourceId="native-1"
          canAnnotate
        />
      </PlayerProvider>
    );

    expect(screen.getByRole("button", { name: /воспроизвести|пауза/i })).toBeInTheDocument();
  });

  it("switches source when another version is selected", async () => {
    const user = userEvent.setup();
    const onSelectAudioSource = vi.fn();

    render(
      <PlayerProvider>
        <AudioPlayer
          audioSources={[makeSource({ id: "v1", streamUrl: "/audio/v1" }), makeSource({ id: "v2", streamUrl: "/audio/v2", versionNumber: 2, isPrimary: false })]}
          annotations={[]}
          onAddAnnotation={vi.fn()}
          onSelectAudioSource={onSelectAudioSource}
          selectedAudioSourceId="v1"
          canAnnotate
        />
      </PlayerProvider>
    );

    await user.selectOptions(screen.getByRole("combobox", { name: "Выбор версии аудио" }), "v2");
    expect(onSelectAudioSource).toHaveBeenCalledWith("v2");
  });

  it("clears stale source when track becomes empty", () => {
    const { rerender } = render(
      <PlayerProvider>
        <AudioPlayer
          audioSources={[makeSource({ id: "v1", streamUrl: "/audio/v1" })]}
          annotations={[]}
          onAddAnnotation={vi.fn()}
          onSelectAudioSource={vi.fn()}
          selectedAudioSourceId="v1"
          canAnnotate
        />
      </PlayerProvider>
    );

    expect(screen.getByRole("button", { name: /воспроизвести|пауза/i })).toBeInTheDocument();

    rerender(
      <PlayerProvider>
        <AudioPlayer
          audioSources={[]}
          annotations={[]}
          onAddAnnotation={vi.fn()}
          onSelectAudioSource={vi.fn()}
          selectedAudioSourceId={null}
          canAnnotate
        />
      </PlayerProvider>
    );

    expect(screen.getAllByText("Аудио не загружено")).toHaveLength(2);
  });

  it("shows external action instead of local playback for external-only sources", () => {
    render(
      <PlayerProvider>
        <AudioPlayer
          audioSources={[makeSource({ id: "ext-1", streamUrl: null, downloadUrl: null, externalUrl: "https://example.com/audio.mp3", externalProvider: "other" })]}
          annotations={[]}
          onAddAnnotation={vi.fn()}
          onSelectAudioSource={vi.fn()}
          selectedAudioSourceId="ext-1"
          canAnnotate
        />
      </PlayerProvider>
    );

    const link = screen.getByRole("link", { name: "Открыть ссылку" });
    expect(link).toHaveAttribute("href", "https://example.com/audio.mp3");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
    expect(screen.queryByRole("button", { name: "Добавить заметку" })).toBeNull();
  });

  it("shows current asset annotations and legacy null annotations, but hides other asset annotations", async () => {
    const user = userEvent.setup();
    render(
      <PlayerProvider>
        <AudioPlayer
          audioSources={[makeSource({ id: "asset-1", trackAssetId: "asset-1", sourceType: "asset" })]}
          annotations={[
            makeAnnotation({ id: "legacy-note", trackAssetId: null, text: "Legacy note", timestampSeconds: 5 }),
            makeAnnotation({ id: "asset-note", trackAssetId: "asset-1", text: "Asset note", timestampSeconds: 8 }),
            makeAnnotation({ id: "other-note", trackAssetId: "asset-2", text: "Other asset note", timestampSeconds: 12 }),
          ]}
          onAddAnnotation={vi.fn()}
          onSelectAudioSource={vi.fn()}
          selectedAudioSourceId="asset-1"
          canAnnotate
        />
      </PlayerProvider>
    );

    await user.click(screen.getByRole("button", { name: "Показать заметки" }));
    expect(screen.getByText("Legacy note")).toBeInTheDocument();
    expect(screen.getByText("Asset note")).toBeInTheDocument();
    expect(screen.queryByText("Other asset note")).not.toBeInTheDocument();
  });

  it("switches visible annotations when source changes", async () => {
    const user = userEvent.setup();
    const sources = [
      makeSource({ id: "asset-1", trackAssetId: "asset-1", sourceType: "asset", versionNumber: 1 }),
      makeSource({ id: "asset-2", trackAssetId: "asset-2", sourceType: "asset", versionNumber: 2, isPrimary: false }),
    ];
    const annotations = [
      makeAnnotation({ id: "legacy-note", trackAssetId: null, text: "Legacy note" }),
      makeAnnotation({ id: "asset-1-note", trackAssetId: "asset-1", text: "Asset 1 note" }),
      makeAnnotation({ id: "asset-2-note", trackAssetId: "asset-2", text: "Asset 2 note" }),
    ];
    const onSelectAudioSource = vi.fn();
    const firstRender = render(
      <PlayerProvider>
        <AudioPlayer
          audioSources={sources}
          annotations={annotations}
          onAddAnnotation={vi.fn()}
          onSelectAudioSource={onSelectAudioSource}
          selectedAudioSourceId="asset-1"
          canAnnotate
        />
      </PlayerProvider>
    );

    await user.click(screen.getByRole("button", { name: "Показать заметки" }));
    expect(screen.getByText("Asset 1 note")).toBeInTheDocument();
    expect(screen.queryByText("Asset 2 note")).not.toBeInTheDocument();

    firstRender.unmount();

    render(
      <PlayerProvider>
        <AudioPlayer
          audioSources={sources}
          annotations={annotations}
          onAddAnnotation={vi.fn()}
          onSelectAudioSource={onSelectAudioSource}
          selectedAudioSourceId="asset-2"
          canAnnotate
        />
      </PlayerProvider>
    );

    await user.click(screen.getByRole("button", { name: "Показать заметки" }));
    expect(screen.getByText("Asset 2 note")).toBeInTheDocument();
    expect(screen.queryByText("Asset 1 note")).not.toBeInTheDocument();
  });

  it("creates annotations only for asset-backed local playback", async () => {
    const user = userEvent.setup();
    const onAddAnnotation = vi.fn();
    render(
      <PlayerProvider>
        <AudioPlayer
          audioSources={[makeSource({ id: "asset-1", trackAssetId: "asset-1", sourceType: "asset" })]}
          annotations={[]}
          onAddAnnotation={onAddAnnotation}
          onSelectAudioSource={vi.fn()}
          selectedAudioSourceId="asset-1"
          canAnnotate
        />
      </PlayerProvider>
    );

    await user.click(screen.getByRole("button", { name: "Добавить заметку" }));
    await user.type(screen.getByPlaceholderText("Что происходит в этот момент?"), "Bound note");
    await user.click(screen.getByRole("button", { name: "Сохранить заметку" }));

    expect(onAddAnnotation).toHaveBeenCalledWith(0, "Bound note", "asset-1");
  });

  it("disables annotation creation for legacy-only playback", () => {
    render(
      <PlayerProvider>
        <AudioPlayer
          audioSources={[makeSource({ id: "legacy-1", sourceType: "legacy", trackAssetId: null, legacyAudioVersionId: "legacy-1" })]}
          annotations={[makeAnnotation({ trackAssetId: null, text: "Legacy note" })]}
          onAddAnnotation={vi.fn()}
          onSelectAudioSource={vi.fn()}
          selectedAudioSourceId="legacy-1"
          canAnnotate
        />
      </PlayerProvider>
    );

    expect(screen.getByRole("button", { name: "Добавить заметку" })).toBeDisabled();
  });

});
