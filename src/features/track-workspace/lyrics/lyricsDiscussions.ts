import type { LyricsDocument } from "./lyricsDocument";

export type LyricsAnchorState = "exact" | "relocated" | "ambiguous" | "orphaned";

export type LyricsAnchorInput = {
  blockId: string | null;
  quote: string | null;
  prefix: string | null;
  suffix: string | null;
  startOffsetHint: number | null;
  endOffsetHint: number | null;
};

export type LyricsLineAnchor = {
  lineIndex: number;
  blockId: string | null;
  blockText: string | null;
  lineText: string;
  lineStartOffset: number | null;
  lineEndOffset: number | null;
  separator: boolean;
};

export type LyricsAnchorResolution = {
  state: LyricsAnchorState;
  matchedBlockId: string | null;
  matchedText: string | null;
  blockPreview: string | null;
};

export type LyricsDiscussionSelection = {
  blockId: string;
  blockText: string;
  displayText: string;
  lineIndex: number;
  quote: string | null;
  prefix: string | null;
  suffix: string | null;
  startOffsetHint: number | null;
  endOffsetHint: number | null;
};

type BlockMatch = {
  blockId: string;
  blockText: string;
};

function findBlockText(document: LyricsDocument, blockId: string) {
  const block = document.blocks.find((item) => item.id === blockId);
  return block ? block.children.map((child) => child.text).join("") : null;
}

function trimPreview(value: string | null) {
  if (value === null) return null;
  return value.length > 160 ? `${value.slice(0, 160)}...` : value;
}

function quoteMatches(text: string, anchor: LyricsAnchorInput) {
  if (!anchor.quote) return true;
  const start = typeof anchor.startOffsetHint === "number" ? anchor.startOffsetHint : -1;
  const end = typeof anchor.endOffsetHint === "number" ? anchor.endOffsetHint : -1;
  if (start >= 0 && end >= start && text.slice(start, end) === anchor.quote) return true;
  return text.includes(anchor.quote);
}

function candidateMatches(text: string, anchor: LyricsAnchorInput) {
  if (!anchor.quote) return false;
  const index = text.indexOf(anchor.quote);
  if (index < 0) return false;
  if (anchor.prefix && index >= anchor.prefix.length && text.slice(index - anchor.prefix.length, index) !== anchor.prefix) return false;
  if (anchor.suffix) {
    const suffixStart = index + anchor.quote.length;
    if (text.slice(suffixStart, suffixStart + anchor.suffix.length) !== anchor.suffix) return false;
  }
  return true;
}

function findCandidates(document: LyricsDocument, anchor: LyricsAnchorInput): BlockMatch[] {
  if (!anchor.quote) return [];
  return document.blocks.flatMap((block) => {
    const text = block.children.map((child) => child.text).join("");
    return candidateMatches(text, anchor) ? [{ blockId: block.id, blockText: text }] : [];
  });
}

export function resolveLyricsAnchor(document: LyricsDocument, anchor: LyricsAnchorInput | null): LyricsAnchorResolution | null {
  if (!anchor || !anchor.blockId) return null;
  const anchoredText = findBlockText(document, anchor.blockId);
  if (anchoredText !== null) {
    return {
      state: quoteMatches(anchoredText, anchor) ? "exact" : "relocated",
      matchedBlockId: anchor.blockId,
      matchedText: anchor.quote,
      blockPreview: trimPreview(anchoredText),
    };
  }

  const candidates = findCandidates(document, anchor);
  if (candidates.length === 1) {
    return {
      state: "relocated",
      matchedBlockId: candidates[0].blockId,
      matchedText: anchor.quote,
      blockPreview: trimPreview(candidates[0].blockText),
    };
  }
  if (candidates.length > 1) {
    return {
      state: "ambiguous",
      matchedBlockId: null,
      matchedText: anchor.quote,
      blockPreview: null,
    };
  }
  return {
    state: "orphaned",
    matchedBlockId: null,
    matchedText: anchor.quote,
    blockPreview: null,
  };
}

export function buildLyricsLineAnchors(document: LyricsDocument): LyricsLineAnchor[] {
  const lines: LyricsLineAnchor[] = [];
  let lineIndex = 0;

  document.blocks.forEach((block, blockIndex) => {
    const blockText = block.children.map((child) => child.text).join("");
    let offset = 0;
    blockText.split("\n").forEach((lineText) => {
      lines.push({
        lineIndex,
        blockId: block.id,
        blockText,
        lineText,
        lineStartOffset: offset,
        lineEndOffset: offset + lineText.length,
        separator: false,
      });
      lineIndex += 1;
      offset += lineText.length + 1;
    });

    if (blockIndex < document.blocks.length - 1) {
      lines.push({
        lineIndex,
        blockId: null,
        blockText: null,
        lineText: "",
        lineStartOffset: null,
        lineEndOffset: null,
        separator: true,
      });
      lineIndex += 1;
    }
  });

  return lines;
}

export function selectionFromLineAnchor(line: LyricsLineAnchor): LyricsDiscussionSelection | null {
  if (!line.blockId || !line.blockText || line.lineStartOffset === null || line.lineEndOffset === null) return null;
  return {
    blockId: line.blockId,
    blockText: line.blockText,
    displayText: line.lineText,
    lineIndex: line.lineIndex,
    quote: line.lineText || null,
    prefix: null,
    suffix: null,
    startOffsetHint: line.lineStartOffset,
    endOffsetHint: line.lineEndOffset,
  };
}

export function selectionFromRange(line: LyricsLineAnchor, startOffset: number, endOffset: number): LyricsDiscussionSelection | null {
  if (!line.blockId || !line.blockText || line.lineStartOffset === null) return null;
  const safeStart = Math.max(0, Math.min(startOffset, line.lineText.length));
  const safeEnd = Math.max(safeStart, Math.min(endOffset, line.lineText.length));
  const quote = line.lineText.slice(safeStart, safeEnd);
  return {
    blockId: line.blockId,
    blockText: line.blockText,
    displayText: line.lineText,
    lineIndex: line.lineIndex,
    quote: quote || null,
    prefix: quote ? line.lineText.slice(Math.max(0, safeStart - 24), safeStart) : null,
    suffix: quote ? line.lineText.slice(safeEnd, safeEnd + 24) : null,
    startOffsetHint: line.lineStartOffset + safeStart,
    endOffsetHint: line.lineStartOffset + safeEnd,
  };
}
