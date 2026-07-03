import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  legacyPlainTextToLyricsDocument,
  lyricsDocumentToPlainText,
} from "../features/track-workspace/lyrics/lyricsDocument";
import {
  parseUpdateLyricsDraft,
  updateLyricsDraftSchema,
} from "../server/schemas/tracks";
import {
  prepareLyricsWrite,
  readTrackLyrics,
  resolveLyricVersion,
  resolveTrackLyrics,
  structuredTrackWriteData,
  structuredVersionWriteData,
} from "../server/services/structuredLyrics";

const leaseToken = "a".repeat(32);
const structured = {
  schemaVersion: 1 as const,
  blocks: [
    {
      id: "heading_001",
      type: "heading" as const,
      children: [{ text: "Title", marks: ["bold" as const] }],
    },
    {
      id: "paragraph_001",
      type: "paragraph" as const,
      children: [{ text: "Unicode 👩‍🎤\nsoft", marks: ["italic" as const] }],
    },
  ],
};

describe("Stage 4B draft payload compatibility", () => {
  it("accepts the unchanged Stage 4A payload", () => {
    const parsed = parseUpdateLyricsDraft({
      content: "legacy\n\ntext",
      baseRevision: 4,
      leaseToken,
    });

    expect(parsed).toEqual({
      content: "legacy\n\ntext",
      baseRevision: 4,
      leaseToken,
    });
  });

  it("accepts and normalizes a structured payload", () => {
    const parsed = parseUpdateLyricsDraft({
      document: structured,
      baseRevision: 5,
      leaseToken,
    });

    expect("document" in parsed && lyricsDocumentToPlainText(parsed.document)).toBe("Title\n\nUnicode 👩‍🎤\nsoft");
  });

  it("rejects malformed documents and ambiguous mixed payloads", () => {
    expect(updateLyricsDraftSchema.safeParse({
      document: { schemaVersion: 1, blocks: [] },
      baseRevision: 0,
      leaseToken,
    }).success).toBe(false);
    expect(updateLyricsDraftSchema.safeParse({
      content: "legacy",
      document: structured,
      baseRevision: 0,
      leaseToken,
    }).success).toBe(false);
  });
});

describe("Stage 4B dual read and dual write", () => {
  it("falls back to legacy Track and LyricVersion text", () => {
    const track = resolveTrackLyrics({
      lyrics: "legacy 👋\n\n",
      lyricsDocument: null,
      lyricsPlainText: null,
    });
    const version = resolveLyricVersion({
      lyrics: "version",
      document: null,
      plainText: null,
      schemaVersion: null,
    });

    expect(track.plainText).toBe("legacy 👋\n\n");
    expect(version.plainText).toBe("version");
  });

  it("writes document, derived text and legacy text from one prepared value", () => {
    const prepared = prepareLyricsWrite({
      document: structured,
      baseRevision: 6,
      leaseToken,
    });

    expect(structuredTrackWriteData(prepared)).toMatchObject({
      lyrics: prepared.plainText,
      lyricsPlainText: prepared.plainText,
    });
    expect(structuredVersionWriteData(prepared)).toMatchObject({
      lyrics: prepared.plainText,
      plainText: prepared.plainText,
      schemaVersion: 1,
    });
  });

  it("reads a valid structured value and stops on mismatches", () => {
    const plainText = lyricsDocumentToPlainText(structured);
    expect(resolveTrackLyrics({
      lyrics: plainText,
      lyricsDocument: structured,
      lyricsPlainText: plainText,
    }).document.blocks[0].id).toBe("heading_001");

    expect(() => resolveTrackLyrics({
      lyrics: "legacy mismatch",
      lyricsDocument: structured,
      lyricsPlainText: plainText,
    })).toThrow(/do not match/);
  });

  it("reads legacy-only drift after a Stage 4A rollback without mutating persistence", () => {
    const plainText = lyricsDocumentToPlainText(structured);
    const fallback = readTrackLyrics({
      lyrics: "edited by Stage 4A",
      lyricsDocument: structured,
      lyricsPlainText: plainText,
    });

    expect(fallback.plainText).toBe("edited by Stage 4A");
    expect(fallback.document.blocks[0].type).toBe("paragraph");
    expect(() => resolveTrackLyrics({
      lyrics: "edited by Stage 4A",
      lyricsDocument: structured,
      lyricsPlainText: plainText,
    })).toThrow(/do not match/);
  });

  it("keeps deterministic IDs for repeated legacy preparation", () => {
    const text = "Куплет\n\nПрипев 👩‍🎤";
    expect(
      prepareLyricsWrite({ content: text, baseRevision: 0, leaseToken }).document,
    ).toEqual(legacyPlainTextToLyricsDocument(text));
  });
});

describe("Stage 4B migration safety", () => {
  it("contains additive nullable columns only", () => {
    const migration = fs.readFileSync(
      path.resolve("prisma/migrations/20260703020000_stage4b_structured_lyrics_persistence/migration.sql"),
      "utf8",
    );

    expect(migration).toContain('ADD COLUMN "lyricsDocument" JSONB');
    expect(migration).toContain('ADD COLUMN "document" JSONB');
    expect(migration).not.toMatch(/NOT NULL|DROP|DELETE|UPDATE/i);
  });
});
