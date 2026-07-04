import { describe, expect, it } from "vitest";
import { parseEmergencyDraft } from "./draftInterface";

describe("lyrics emergency draft compatibility", () => {
  it("keeps old string-only drafts readable", () => {
    const parsed = parseEmergencyDraft(JSON.stringify({
      key: "lyrics-draft:user:project:track",
      content: "old local string",
      savedAt: "2026-07-04T10:00:00.000Z",
      syncState: "local-only",
    }));
    expect(parsed).toMatchObject({ content: "old local string" });
    expect(parsed && "document" in parsed).toBe(false);
  });

  it("accepts the additive structured envelope while retaining content", () => {
    const document = {
      schemaVersion: 1,
      blocks: [{ id: "paragraph_001", type: "paragraph", children: [{ text: "structured" }] }],
    };
    expect(parseEmergencyDraft(JSON.stringify({
      key: "lyrics-draft:user:project:track",
      content: "structured",
      document,
      savedAt: "2026-07-04T10:00:00.000Z",
      syncState: "local-only",
    }))).toMatchObject({ content: "structured", document });
  });
});
