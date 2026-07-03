# ADR: Stage 4B lyrics document foundation

Date: 2026-07-03
Status: accepted for foundation slices 1–2
Stage: 4B

## Context

Stage 4A stores canonical plain text in `Track.lyrics` and protects saves with an explicit edit lease plus monotonic `lyricsRevision` OCC. Stage 4B needs limited rich text and stable block IDs without breaking old clients, local drafts, rollback, or the existing autosave/recovery behavior.

The persisted format must be owned by CollabStudio. Editor-library JSON is an adapter format and must never become the database or API contract.

## Editor decision

Use Lexical for the future editor UI adapter, subject to the Stage 4B UI compatibility spike for the exact pinned package version.

Reasons:

- official React composition through `@lexical/react`;
- headless, plugin-based surface that can be restricted to paragraphs, headings, bold, italic, line breaks and history;
- explicit editor-state update and JSON serialization APIs;
- no requirement to build a complex `contentEditable` implementation from scratch.

Official references:

- <https://lexical.dev/docs/getting-started/react>
- <https://lexical.dev/docs/concepts/editor-state>
- <https://lexical.dev/docs/concepts/serialization>

The future adapter must verify React 19 compatibility, Chromium/WebKit IME composition, Android/iOS selection, undo/redo, and plain/rich paste before the feature flag can be enabled. No Lexical dependency is added in these foundation slices.

## Persisted document contract

```ts
type LyricsMark = "bold" | "italic";

type LyricsDocument = {
  schemaVersion: 1;
  blocks: Array<{
    id: string;
    type: "paragraph" | "heading";
    children: Array<{
      text: string;
      marks?: LyricsMark[];
    }>;
  }>;
};
```

Rules:

- a document always has at least one block;
- block IDs match `^[A-Za-z0-9_-]{8,128}$` and are unique inside the document;
- normalization preserves every valid block ID and never regenerates it;
- legacy conversion generates deterministic IDs once; later edits carry those IDs forward;
- marks are deduplicated and serialized in canonical `bold`, `italic` order;
- adjacent text children with identical marks are merged;
- text is not trimmed and Unicode is not normalized;
- unsupported schema versions, nodes, marks, fields, duplicate IDs and malformed values are rejected.

Schema upgrades are explicit pure upcasters. A reader does not guess how to handle an unknown future `schemaVersion`.

## Plain text and line breaks

Derived plain text is deterministic:

1. Concatenate each block's child text without separators.
2. Join blocks with exactly `\n\n`.
3. A `\n` inside child text is a soft line break.
4. The `\n\n` between blocks is a hard paragraph/heading break.

Legacy conversion performs the inverse split on non-overlapping `\n\n`. It creates paragraph blocks only; it does not infer headings or marks. Empty leading, middle and trailing segments become empty blocks, so all LF runs round-trip exactly. Other code units, including Unicode, emoji and legacy CRLF sequences, are preserved by the migration codec. Paste sanitization separately canonicalizes CRLF/CR to LF.

## Paste sanitization

The persistence codec never accepts arbitrary HTML. The future editor adapter supplies `text/plain` to the foundation sanitizer:

- HTML is ignored, never stored or executed;
- CRLF and lone CR become LF;
- NUL and C0 controls are removed except LF and tab;
- Unicode, emoji, zero-width joiners and directional text are otherwise preserved;
- sanitized text is converted through the same deterministic legacy-to-document codec.

The later Lexical adapter may explicitly map only `p`, supported headings, `strong`/`b`, `em`/`i`, and `br`; every other element, attribute and style must degrade to sanitized text.

## Compatibility contract

### Legacy server data

Future reads use a validated structured document when present; otherwise they convert legacy `lyrics`. Future writes atomically persist:

- validated structured document;
- derived plain text;
- the same derived text in legacy `lyrics`;
- exactly one `lyricsRevision` increment guarded by the existing base revision and lease.

`LyricVersion.lyrics` receives the same compatibility treatment when rich snapshots are implemented later. Autosave still must not create versions.

### Local drafts

Existing IndexedDB and sessionStorage records with string `content` remain readable unchanged. A future structured draft envelope must be additive and retain derived string `content`, `baseRevision`, timestamps and sync state. Old string drafts convert locally without acquiring a lease; server save still requires a fresh lease and OCC check.

### Rollback

The previous Stage 4A application must be able to read the legacy fields written by the new backend. Application rollback never requires a destructive down migration. Structured fields remain additive, and cleanup of legacy fields requires a later ADR and observation period.

## Feature flag

`lyricsStructuredEditor` is a frontend rollout flag and defaults to `false`.

- `false`: Stage 4A plain-text editor and serializers remain active.
- `true`: a future UI adapter may render the structured editor after all Stage 4B gates pass.
- backend dual-read/dual-write and migration correctness must not depend on the frontend flag;
- no automatic enablement or production rollout is part of these foundation slices.

## Consequences and non-goals

The pure codec can be tested before schema/API/UI work and remains independent of Lexical. These slices do not add Prisma migrations, API changes, editor UI, comments/anchors, snapshots, production deploy, or later-stage work.
