import { describe, expect, it } from "vitest";
import { buildLyricsLineAnchors, resolveLyricsAnchor, selectionFromLineAnchor, selectionFromRange } from "./lyricsDiscussions";
import type { LyricsDocument } from "./lyricsDocument";

const document: LyricsDocument = {
  schemaVersion: 1,
  blocks: [
    { id: "block_intro", type: "heading", children: [{ text: "Intro" }] },
    { id: "block_verse", type: "paragraph", children: [{ text: "First line\nSecond line" }] },
    { id: "block_hook", type: "paragraph", children: [{ text: "Hook line" }] },
  ],
};

describe("lyrics discussion anchors", () => {
  it("builds stable line anchors with separator lines between blocks", () => {
    const lines = buildLyricsLineAnchors(document);
    expect(lines.map((line) => [line.lineIndex, line.blockId, line.lineText, line.separator])).toEqual([
      [0, "block_intro", "Intro", false],
      [1, null, "", true],
      [2, "block_verse", "First line", false],
      [3, "block_verse", "Second line", false],
      [4, null, "", true],
      [5, "block_hook", "Hook line", false],
    ]);
  });

  it("resolves an exact anchor when block id and quote still match", () => {
    expect(resolveLyricsAnchor(document, {
      blockId: "block_verse",
      quote: "First line",
      prefix: null,
      suffix: null,
      startOffsetHint: 0,
      endOffsetHint: 10,
    })).toMatchObject({ state: "exact", matchedBlockId: "block_verse" });
  });

  it("marks an anchor as relocated when block id survives but quote changed", () => {
    expect(resolveLyricsAnchor(document, {
      blockId: "block_verse",
      quote: "Old line",
      prefix: null,
      suffix: null,
      startOffsetHint: 0,
      endOffsetHint: 8,
    })).toMatchObject({ state: "relocated", matchedBlockId: "block_verse" });
  });

  it("marks an anchor as ambiguous when the old block disappears and multiple quote matches exist", () => {
    const ambiguous: LyricsDocument = {
      schemaVersion: 1,
      blocks: [
        { id: "x1_match", type: "paragraph", children: [{ text: "repeat" }] },
        { id: "x2_match", type: "paragraph", children: [{ text: "repeat" }] },
      ],
    };
    expect(resolveLyricsAnchor(ambiguous, {
      blockId: "missing_block",
      quote: "repeat",
      prefix: null,
      suffix: null,
      startOffsetHint: 0,
      endOffsetHint: 6,
    })).toMatchObject({ state: "ambiguous", matchedBlockId: null });
  });

  it("marks an anchor as orphaned when block and quote can no longer be found", () => {
    expect(resolveLyricsAnchor(document, {
      blockId: "missing_block",
      quote: "gone forever",
      prefix: null,
      suffix: null,
      startOffsetHint: 0,
      endOffsetHint: 12,
    })).toMatchObject({ state: "orphaned", matchedBlockId: null });
  });

  it("creates block-level and text-range selections for manual re-anchor flows", () => {
    const line = buildLyricsLineAnchors(document)[2];
    expect(selectionFromLineAnchor(line)).toMatchObject({
      blockId: "block_verse",
      quote: "First line",
      startOffsetHint: 0,
      endOffsetHint: 10,
    });
    expect(selectionFromRange(line, 0, 5)).toMatchObject({
      blockId: "block_verse",
      quote: "First",
      startOffsetHint: 0,
      endOffsetHint: 5,
    });
  });
});
