import { describe, expect, it } from "vitest";
import { legacyPlainTextToLyricsDocument } from "./lyricsDocument";
import { buildLyricsDraftWrite } from "./useLyricsDocumentDraft";

describe("structured lyrics save payload feature flag", () => {
  const document = legacyPlainTextToLyricsDocument("lyrics");
  const leaseToken = "a".repeat(32);

  it("keeps the exact Stage 4A content payload while the flag is off", () => {
    expect(buildLyricsDraftWrite(false, document, "lyrics", 4, leaseToken)).toEqual({
      content: "lyrics",
      baseRevision: 4,
      leaseToken,
    });
  });

  it("uses the app-owned document payload while the flag is on", () => {
    expect(buildLyricsDraftWrite(true, document, "lyrics", 4, leaseToken)).toEqual({
      document,
      baseRevision: 4,
      leaseToken,
    });
  });
});
