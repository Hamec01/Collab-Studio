import assert from "node:assert/strict";
import { it } from "vitest";
import {
  LyricsDocumentValidationError,
  deserializeLyricsDocument,
  legacyPlainTextToLyricsDocument,
  localDraftContentToLyricsDocument,
  lyricsDocumentToPlainText,
  normalizeLyricsDocument,
  sanitizePastedLyrics,
  serializeLyricsDocument,
  type LyricsDocument,
} from "./lyricsDocument";

const richDocument: LyricsDocument = {
  schemaVersion: 1,
  blocks: [
    {
      id: "heading_001",
      type: "heading",
      children: [
        { text: "Title ", marks: ["italic", "bold", "bold"] },
        { text: "line", marks: ["bold", "italic"] },
      ],
    },
    {
      id: "paragraph_001",
      type: "paragraph",
      children: [
        { text: "soft\n", marks: ["italic"] },
        { text: "break", marks: ["bold"] },
      ],
    },
  ],
};

it("legacy plain text round-trips Unicode, emoji, empty lines and LF runs losslessly", () => {
  const values = [
    "",
    "Привет, 世界 👩‍🎤",
    "\n",
    "\n\n",
    "first\nsecond\n\nthird",
    "leading\n\n\nmiddle\n\n",
    "CRLF remains byte-identical\r\n\r\nwhen migrated",
  ];

  for (const value of values) {
    assert.equal(lyricsDocumentToPlainText(legacyPlainTextToLyricsDocument(value)), value);
  }
});

it("normalization rejects malformed and future document input", () => {
  const malformed = [
    null,
    {},
    { schemaVersion: 2, blocks: [] },
    { schemaVersion: 1, blocks: [] },
    { schemaVersion: 1, blocks: [{ id: "short", type: "paragraph", children: [{ text: "" }] }] },
    { schemaVersion: 1, blocks: [{ id: "paragraph_001", type: "list", children: [{ text: "" }] }] },
    { schemaVersion: 1, blocks: [{ id: "paragraph_001", type: "paragraph", children: [{ text: "", marks: ["underline"] }] }] },
    { schemaVersion: 1, blocks: [{ id: "paragraph_001", type: "paragraph", children: [{ text: "" }], html: "<b>x</b>" }] },
    { schemaVersion: 1, blocks: [{ id: "paragraph_001", type: "paragraph", children: [{ text: "hard\n\nbreak" }] }] },
    {
      schemaVersion: 1,
      blocks: [
        { id: "duplicate_01", type: "paragraph", children: [{ text: "a" }] },
        { id: "duplicate_01", type: "paragraph", children: [{ text: "b" }] },
      ],
    },
  ];

  for (const value of malformed) {
    assert.throws(() => normalizeLyricsDocument(value), LyricsDocumentValidationError);
  }
  assert.throws(() => deserializeLyricsDocument("{broken"), LyricsDocumentValidationError);
});

it("old string draft content remains compatible", () => {
  const document = localDraftContentToLyricsDocument("old draft\n\nstill safe");

  assert.equal(document.schemaVersion, 1);
  assert.equal(lyricsDocumentToPlainText(document), "old draft\n\nstill safe");
});

it("normalization preserves block IDs and legacy conversion is deterministic", () => {
  const normalizedOnce = normalizeLyricsDocument(richDocument);
  const normalizedTwice = normalizeLyricsDocument(normalizedOnce);
  assert.deepEqual(
    normalizedTwice.blocks.map((block) => block.id),
    ["heading_001", "paragraph_001"],
  );

  const first = legacyPlainTextToLyricsDocument("same\n\nlegacy");
  const second = legacyPlainTextToLyricsDocument("same\n\nlegacy");
  assert.deepEqual(
    first.blocks.map((block) => block.id),
    second.blocks.map((block) => block.id),
  );
});

it("headings, bold and italic survive canonical normalization", () => {
  const normalized = normalizeLyricsDocument(richDocument);

  assert.equal(normalized.blocks[0].type, "heading");
  assert.deepEqual(normalized.blocks[0].children, [
    { text: "Title line", marks: ["bold", "italic"] },
  ]);
  assert.equal(normalized.blocks[1].type, "paragraph");
  assert.deepEqual(normalized.blocks[1].children[0].marks, ["italic"]);
  assert.deepEqual(normalized.blocks[1].children[1].marks, ["bold"]);
});

it("soft breaks remain inside blocks and hard breaks separate blocks", () => {
  assert.equal(
    lyricsDocumentToPlainText(richDocument),
    "Title line\n\nsoft\nbreak",
  );

  const restored = legacyPlainTextToLyricsDocument("line one\nline two\n\nnext block");
  assert.equal(restored.blocks.length, 2);
  assert.equal(restored.blocks[0].children[0].text, "line one\nline two");
  assert.equal(restored.blocks[1].children[0].text, "next block");
});

it("paste sanitization ignores HTML and removes unsupported control data", () => {
  const document = sanitizePastedLyrics({
    plainText: "A\r\nB\rC\u0000\u0007\t👩‍🎤",
    html: "<img src=x onerror=alert(1)><script>alert(1)</script><b>ignored</b>",
  });

  assert.equal(lyricsDocumentToPlainText(document), "A\nB\nC\t👩‍🎤");
  assert.equal(serializeLyricsDocument(document).includes("script"), false);
  assert.equal(serializeLyricsDocument(document).includes("onerror"), false);
});

it("serialization is deterministic after canonical mark and child normalization", () => {
  const first = serializeLyricsDocument(richDocument);
  const second = serializeLyricsDocument(deserializeLyricsDocument(first));

  assert.equal(first, second);
  assert.equal(
    first,
    '{"schemaVersion":1,"blocks":[{"id":"heading_001","type":"heading","children":[{"text":"Title line","marks":["bold","italic"]}]},{"id":"paragraph_001","type":"paragraph","children":[{"text":"soft\\n","marks":["italic"]},{"text":"break","marks":["bold"]}]}]}',
  );
});
