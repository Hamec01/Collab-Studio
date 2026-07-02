import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlayerProvider, usePlayer } from "./PlayerProvider";

function PlayerProbe() {
  const { selectedAudioVersionId, syncSelectedAudioVersion, setSelectedAudioVersionId } = usePlayer();

  return (
    <div>
      <div data-testid="selected">{selectedAudioVersionId ?? "none"}</div>
      <button
        onClick={() => {
          syncSelectedAudioVersion([
            { id: "a1", label: "A1", sourceType: "uploaded", storageKey: "s1", url: null, externalUrl: null, externalProvider: null, durationSec: null, sizeBytes: null, mimeType: null, uploadedBy: null, createdAt: "2026-07-02T00:00:00.000Z" },
            { id: "a2", label: "A2", sourceType: "uploaded", storageKey: "s2", url: null, externalUrl: null, externalProvider: null, durationSec: null, sizeBytes: null, mimeType: null, uploadedBy: null, createdAt: "2026-07-02T00:00:00.000Z" },
          ]);
        }}
      >
        sync-a12
      </button>
      <button
        onClick={() => {
          setSelectedAudioVersionId("a2");
        }}
      >
        select-a2
      </button>
      <button
        onClick={() => {
          syncSelectedAudioVersion([
            { id: "a3", label: "A3", sourceType: "uploaded", storageKey: "s3", url: null, externalUrl: null, externalProvider: null, durationSec: null, sizeBytes: null, mimeType: null, uploadedBy: null, createdAt: "2026-07-02T00:00:00.000Z" },
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
