import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlayerProvider, usePlayer } from "./PlayerProvider";

function PlayerProbe() {
  const { selectedAudioSourceId, syncSelectedAudioSource, setSelectedAudioSourceId } = usePlayer();

  return (
    <div>
      <div data-testid="selected">{selectedAudioSourceId ?? "none"}</div>
      <button
        onClick={() => {
          syncSelectedAudioSource([
            { id: "a1", sourceType: "legacy", trackAssetId: null, legacyAudioVersionId: "a1", versionNumber: 1, title: "A1", originalFilename: "a1.wav", streamUrl: "/a1", downloadUrl: "/a1/download", externalUrl: null, externalProvider: null, mimeType: "audio/wav", durationMs: null, isPrimary: true, createdAt: "2026-07-02T00:00:00.000Z", uploadedBy: null, canDelete: true },
            { id: "a2", sourceType: "legacy", trackAssetId: null, legacyAudioVersionId: "a2", versionNumber: 2, title: "A2", originalFilename: "a2.wav", streamUrl: "/a2", downloadUrl: "/a2/download", externalUrl: null, externalProvider: null, mimeType: "audio/wav", durationMs: null, isPrimary: false, createdAt: "2026-07-02T00:00:00.000Z", uploadedBy: null, canDelete: true },
          ]);
        }}
      >
        sync-a12
      </button>
      <button
        onClick={() => {
          setSelectedAudioSourceId("a2");
        }}
      >
        select-a2
      </button>
      <button
        onClick={() => {
          syncSelectedAudioSource([
            { id: "a3", sourceType: "asset", trackAssetId: "a3", legacyAudioVersionId: null, versionNumber: null, title: "A3", originalFilename: "a3.wav", streamUrl: "/a3", downloadUrl: "/a3/download", externalUrl: null, externalProvider: null, mimeType: "audio/wav", durationMs: null, isPrimary: true, createdAt: "2026-07-02T00:00:00.000Z", uploadedBy: null, canDelete: false },
          ]);
        }}
      >
        sync-a3
      </button>
    </div>
  );
}

describe("PlayerProvider", () => {
  it("selects first version when nothing is selected", async () => {
    const user = userEvent.setup();
    render(
      <PlayerProvider>
        <PlayerProbe />
      </PlayerProvider>,
    );

    expect(screen.getByTestId("selected").textContent).toBe("none");
    await user.click(screen.getByRole("button", { name: "sync-a12" }));
    expect(screen.getByTestId("selected").textContent).toBe("a1");
  });

  it("keeps current selection when it still exists", async () => {
    const user = userEvent.setup();
    render(
      <PlayerProvider>
        <PlayerProbe />
      </PlayerProvider>,
    );

    await user.click(screen.getByRole("button", { name: "sync-a12" }));
    await user.click(screen.getByRole("button", { name: "select-a2" }));
    await user.click(screen.getByRole("button", { name: "sync-a12" }));

    expect(screen.getByTestId("selected").textContent).toBe("a2");
  });

  it("falls back when previous selection disappears", async () => {
    const user = userEvent.setup();
    render(
      <PlayerProvider>
        <PlayerProbe />
      </PlayerProvider>,
    );

    await user.click(screen.getByRole("button", { name: "sync-a12" }));
    await user.click(screen.getByRole("button", { name: "select-a2" }));
    await user.click(screen.getByRole("button", { name: "sync-a3" }));

    expect(screen.getByTestId("selected").textContent).toBe("a3");
  });
});
