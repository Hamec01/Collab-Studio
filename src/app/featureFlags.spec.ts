import { describe, expect, it } from "vitest";
import { DEFAULT_FEATURE_FLAGS, resolveFeatureFlags } from "./featureFlags";

describe("feature flag defaults", () => {
  it("returns safe defaults when env is empty", () => {
    expect(resolveFeatureFlags({})).toEqual(DEFAULT_FEATURE_FLAGS);
  });

  it("does not enable unknown flags", () => {
    const flags = resolveFeatureFlags({
      VITE_FEATURE_FLAGS: "unknown=true,another=true",
    });

    expect(flags.internalDiagnostics).toBe(false);
    expect(flags.lyricsStructuredEditor).toBe(false);
  });

  it("parses known flags from list and explicit override", () => {
    const fromList = resolveFeatureFlags({
      VITE_FEATURE_FLAGS: "internalDiagnostics=true",
    });
    expect(fromList.internalDiagnostics).toBe(true);

    const overridden = resolveFeatureFlags({
      VITE_FEATURE_FLAGS: "internalDiagnostics=true",
      VITE_FLAG_INTERNAL_DIAGNOSTICS: "false",
    });
    expect(overridden.internalDiagnostics).toBe(false);
  });

  it("keeps the structured lyrics editor off by default and supports an explicit override", () => {
    expect(resolveFeatureFlags({}).lyricsStructuredEditor).toBe(false);
    expect(resolveFeatureFlags({
      VITE_FEATURE_FLAGS: "lyricsStructuredEditor=true",
    }).lyricsStructuredEditor).toBe(true);
    expect(resolveFeatureFlags({
      VITE_FEATURE_FLAGS: "lyricsStructuredEditor=true",
      VITE_FLAG_LYRICS_STRUCTURED_EDITOR: "false",
    }).lyricsStructuredEditor).toBe(false);
  });
});
