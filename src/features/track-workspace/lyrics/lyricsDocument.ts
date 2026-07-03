export const LYRICS_DOCUMENT_SCHEMA_VERSION = 1 as const;
export const MAX_LYRICS_PLAIN_TEXT_LENGTH = 200_000;

export const LYRICS_MARKS = ["bold", "italic"] as const;
export type LyricsMark = (typeof LYRICS_MARKS)[number];
export type LyricsBlockType = "paragraph" | "heading";

export type LyricsText = {
  text: string;
  marks?: LyricsMark[];
};

export type LyricsBlock = {
  id: string;
  type: LyricsBlockType;
  children: LyricsText[];
};

export type LyricsDocument = {
  schemaVersion: typeof LYRICS_DOCUMENT_SCHEMA_VERSION;
  blocks: LyricsBlock[];
};

export type LyricsPastePayload = {
  plainText: string;
  html?: string;
};

const BLOCK_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;
const DOCUMENT_KEYS = new Set(["schemaVersion", "blocks"]);
const BLOCK_KEYS = new Set(["id", "type", "children"]);
const TEXT_KEYS = new Set(["text", "marks"]);
const MARK_ORDER = new Map<LyricsMark, number>(LYRICS_MARKS.map((mark, index) => [mark, index]));

export class LyricsDocumentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LyricsDocumentValidationError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new LyricsDocumentValidationError(`${path} must be an object`);
  }
  return value;
}

function requireOnlyKeys(value: Record<string, unknown>, allowed: Set<string>, path: string) {
  const unexpected = Object.keys(value).find((key) => !allowed.has(key));
  if (unexpected) {
    throw new LyricsDocumentValidationError(`${path}.${unexpected} is not supported`);
  }
}

function normalizeMarks(value: unknown, path: string): LyricsMark[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    throw new LyricsDocumentValidationError(`${path} must be an array`);
  }

  const marks = new Set<LyricsMark>();
  for (const mark of value) {
    if (mark !== "bold" && mark !== "italic") {
      throw new LyricsDocumentValidationError(`${path} contains an unsupported mark`);
    }
    marks.add(mark);
  }

  const normalized = [...marks].sort((left, right) => MARK_ORDER.get(left)! - MARK_ORDER.get(right)!);
  return normalized.length > 0 ? normalized : undefined;
}

function sameMarks(left: LyricsMark[] | undefined, right: LyricsMark[] | undefined) {
  if (left === undefined || right === undefined) return left === right;
  return left.length === right.length && left.every((mark, index) => mark === right[index]);
}

function normalizeChildren(value: unknown, path: string): LyricsText[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new LyricsDocumentValidationError(`${path} must contain at least one text child`);
  }

  const children: LyricsText[] = [];
  value.forEach((rawChild, index) => {
    const childPath = `${path}[${index}]`;
    const child = requireRecord(rawChild, childPath);
    requireOnlyKeys(child, TEXT_KEYS, childPath);
    if (typeof child.text !== "string") {
      throw new LyricsDocumentValidationError(`${childPath}.text must be a string`);
    }

    const marks = normalizeMarks(child.marks, `${childPath}.marks`);
    if (child.text.length === 0 && value.length > 1) return;

    const previous = children.at(-1);
    if (previous && sameMarks(previous.marks, marks)) {
      previous.text += child.text;
      return;
    }

    children.push(marks ? { text: child.text, marks } : { text: child.text });
  });

  return children.length > 0 ? children : [{ text: "" }];
}

export function normalizeLyricsDocument(input: unknown): LyricsDocument {
  const document = requireRecord(input, "document");
  requireOnlyKeys(document, DOCUMENT_KEYS, "document");

  if (document.schemaVersion !== LYRICS_DOCUMENT_SCHEMA_VERSION) {
    throw new LyricsDocumentValidationError("document.schemaVersion is unsupported");
  }
  if (!Array.isArray(document.blocks) || document.blocks.length === 0) {
    throw new LyricsDocumentValidationError("document.blocks must contain at least one block");
  }

  const blockIds = new Set<string>();
  const blocks = document.blocks.map((rawBlock, index): LyricsBlock => {
    const path = `document.blocks[${index}]`;
    const block = requireRecord(rawBlock, path);
    requireOnlyKeys(block, BLOCK_KEYS, path);

    if (typeof block.id !== "string" || !BLOCK_ID_PATTERN.test(block.id)) {
      throw new LyricsDocumentValidationError(`${path}.id is invalid`);
    }
    if (blockIds.has(block.id)) {
      throw new LyricsDocumentValidationError(`${path}.id is duplicated`);
    }
    blockIds.add(block.id);

    if (block.type !== "paragraph" && block.type !== "heading") {
      throw new LyricsDocumentValidationError(`${path}.type is unsupported`);
    }

    const children = normalizeChildren(block.children, `${path}.children`);
    if (children.map((child) => child.text).join("").includes("\n\n")) {
      throw new LyricsDocumentValidationError(`${path}.children contains a hard break inside a block`);
    }

    return {
      id: block.id,
      type: block.type,
      children,
    };
  });

  const normalized: LyricsDocument = {
    schemaVersion: LYRICS_DOCUMENT_SCHEMA_VERSION,
    blocks,
  };
  if (lyricsDocumentToPlainTextUnchecked(normalized).length > MAX_LYRICS_PLAIN_TEXT_LENGTH) {
    throw new LyricsDocumentValidationError("document plain text is too long");
  }
  return normalized;
}

export function isLyricsDocument(input: unknown): input is LyricsDocument {
  try {
    normalizeLyricsDocument(input);
    return true;
  } catch {
    return false;
  }
}

function hashText(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36).padStart(7, "0");
}

function legacyBlockId(documentHash: string, blockText: string, index: number) {
  return `lb_${index.toString(36)}_${documentHash}_${hashText(blockText)}`;
}

export function legacyPlainTextToLyricsDocument(plainText: string): LyricsDocument {
  if (typeof plainText !== "string") {
    throw new LyricsDocumentValidationError("legacy plain text must be a string");
  }
  if (plainText.length > MAX_LYRICS_PLAIN_TEXT_LENGTH) {
    throw new LyricsDocumentValidationError("legacy plain text is too long");
  }

  const documentHash = hashText(plainText);
  const blocks = plainText.split("\n\n").map((text, index): LyricsBlock => ({
    id: legacyBlockId(documentHash, text, index),
    type: "paragraph",
    children: [{ text }],
  }));

  return {
    schemaVersion: LYRICS_DOCUMENT_SCHEMA_VERSION,
    blocks,
  };
}

function lyricsDocumentToPlainTextUnchecked(document: LyricsDocument) {
  return document.blocks
    .map((block) => block.children.map((child) => child.text).join(""))
    .join("\n\n");
}

export function lyricsDocumentToPlainText(input: unknown) {
  return lyricsDocumentToPlainTextUnchecked(normalizeLyricsDocument(input));
}

export function serializeLyricsDocument(input: unknown) {
  return JSON.stringify(normalizeLyricsDocument(input));
}

export function deserializeLyricsDocument(serialized: string) {
  if (typeof serialized !== "string") {
    throw new LyricsDocumentValidationError("serialized document must be a string");
  }

  try {
    return normalizeLyricsDocument(JSON.parse(serialized));
  } catch (error) {
    if (error instanceof LyricsDocumentValidationError) throw error;
    throw new LyricsDocumentValidationError("serialized document is not valid JSON");
  }
}

export function localDraftContentToLyricsDocument(content: unknown) {
  return typeof content === "string"
    ? legacyPlainTextToLyricsDocument(content)
    : normalizeLyricsDocument(content);
}

export function sanitizePastedPlainText(plainText: string) {
  if (typeof plainText !== "string") {
    throw new LyricsDocumentValidationError("pasted plain text must be a string");
  }

  return plainText
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
}

export function sanitizePastedLyrics(payload: LyricsPastePayload) {
  const value = requireRecord(payload, "paste");
  if (typeof value.plainText !== "string") {
    throw new LyricsDocumentValidationError("paste.plainText must be a string");
  }

  return legacyPlainTextToLyricsDocument(sanitizePastedPlainText(value.plainText));
}
