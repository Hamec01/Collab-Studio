import { describe, expect, it } from "vitest";
import { buildLyricsDraftWrite } from "./useLyricsDocumentDraft";
import {
  buildCreateLyricSnapshotPayload,
  buildLyricsTxtFilename,
  buildRestoreLyricSnapshotPayload,
  resolveSnapshotDocument,
  resolveSnapshotPlainText,
} from "./lyricsSnapshots";

const leaseToken = "a".repeat(32);

const structuredDocument = {
  schemaVersion: 1 as const,
  blocks: [
    { id: "heading_001", type: "heading" as const, children: [{ text: "Интро", marks: ["bold" as const] }] },
    { id: "paragraph_001", type: "paragraph" as const, children: [{ text: "Первая строка" }] },
    { id: "paragraph_002", type: "paragraph" as const, children: [{ text: "Вторая 👩‍🎤\n" }] },
  ],
};

describe("lyricsSnapshots", () => {
  it("creates a structured snapshot payload when the feature flag is on", () => {
    const payload = buildCreateLyricSnapshotPayload(true, structuredDocument, "ignored", "Demo");

    expect(payload).toEqual({
      label: "Demo",
      document: structuredDocument,
    });
  });

  it("creates a legacy snapshot payload when the feature flag is off", () => {
    const payload = buildCreateLyricSnapshotPayload(false, structuredDocument, "plain snapshot", "Demo");

    expect(payload).toEqual({
      label: "Demo",
      lyrics: "plain snapshot",
    });
  });

  it("restores a structured snapshot with stable block ids", () => {
    const payload = buildRestoreLyricSnapshotPayload(true, {
      lyrics: "fallback",
      plainText: "fallback",
      document: structuredDocument,
    }, 7, leaseToken);

    expect(payload).toEqual({
      document: structuredDocument,
      baseRevision: 7,
      leaseToken,
    });
    expect(resolveSnapshotDocument({
      lyrics: "fallback",
      document: structuredDocument,
    }).blocks.map((block) => block.id)).toEqual(["heading_001", "paragraph_001", "paragraph_002"]);
  });

  it("restores a legacy snapshot through plain text compatibility", () => {
    expect(buildRestoreLyricSnapshotPayload(false, {
      lyrics: "legacy\n\nsnapshot",
      plainText: undefined,
      document: undefined,
    }, 3, leaseToken)).toEqual({
      content: "legacy\n\nsnapshot",
      baseRevision: 3,
      leaseToken,
    });

    expect(resolveSnapshotDocument({
      lyrics: "legacy\n\nsnapshot",
      document: undefined,
    }).blocks).toHaveLength(2);
  });

  it("derives TXT export from plain text without formatting metadata", () => {
    expect(resolveSnapshotPlainText({
      lyrics: "ignored",
      plainText: "ignored",
      document: structuredDocument,
    })).toBe("Интро\n\nПервая строка\n\nВторая 👩‍🎤\n");
  });

  it("keeps autosave payloads separate from snapshot creation", () => {
    const autosavePayload = buildLyricsDraftWrite(true, structuredDocument, "ignored", 5, leaseToken);

    expect(autosavePayload).toEqual({
      document: structuredDocument,
      baseRevision: 5,
      leaseToken,
    });
    expect("label" in autosavePayload).toBe(false);
  });

  it("builds safe predictable TXT filenames", () => {
    expect(buildLyricsTxtFilename("Песня / Demo", "Final ✨")).toBe("lyrics-песня-demo-final.txt");
    expect(buildLyricsTxtFilename("   ", null)).toBe("lyrics-track.txt");
  });
});
