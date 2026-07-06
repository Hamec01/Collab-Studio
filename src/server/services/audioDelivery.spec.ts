import { describe, expect, it } from "vitest";
import { AppError } from "../middleware/errors";
import {
  buildContentDispositionHeader,
  isTrackAssetKindDeliverable,
  isTrackAssetStatusDeliverable,
  parseAudioByteRange,
  sanitizeContentDispositionFilename,
} from "./audioDelivery";

function expectAppError(action: () => unknown, code: string) {
  try {
    action();
    throw new Error(`Expected AppError ${code}`);
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe(code);
  }
}

describe("audioDelivery", () => {
  it("parses standard, suffix, and open-ended byte ranges", () => {
    expect(parseAudioByteRange("bytes=0-3", 10)).toEqual({ start: 0, end: 3 });
    expect(parseAudioByteRange("bytes=4-", 10)).toEqual({ start: 4, end: 9 });
    expect(parseAudioByteRange("bytes=-4", 10)).toEqual({ start: 6, end: 9 });
    expect(parseAudioByteRange(undefined, 10)).toBeNull();
  });

  it("rejects invalid and multi-range requests", () => {
    expectAppError(() => parseAudioByteRange("bytes=4-3", 10), "INVALID_RANGE");
    expectAppError(() => parseAudioByteRange("bytes=0-1,4-5", 10), "INVALID_RANGE");
    expectAppError(() => parseAudioByteRange("bytes=", 10), "INVALID_RANGE");
    expectAppError(() => parseAudioByteRange("bytes=0-1", 0), "INVALID_RANGE");
  });

  it("sanitizes filenames for content disposition", () => {
    expect(sanitizeContentDispositionFilename("demo.wav")).toEqual({
      safe: "demo.wav",
      encoded: "demo.wav",
    });
    expect(sanitizeContentDispositionFilename("bad\r\nname/../тест.wav").safe).toBe("badname_.._____.wav");
    expect(buildContentDispositionHeader("quote\"slash/line.wav", "attachment")).toContain("attachment;");
    expect(buildContentDispositionHeader("quote\"slash/line.wav", "attachment")).not.toContain("\r");
    expect(buildContentDispositionHeader("quote\"slash/line.wav", "attachment")).not.toContain("\n");
  });

  it("validates deliverable kinds and statuses", () => {
    expect(isTrackAssetKindDeliverable("AUDIO_VERSION")).toBe(true);
    expect(isTrackAssetKindDeliverable("REFERENCE")).toBe(true);
    expect(isTrackAssetKindDeliverable("OTHER")).toBe(false);
    expect(isTrackAssetStatusDeliverable("READY")).toBe(true);
    expect(isTrackAssetStatusDeliverable("UPLOADING")).toBe(false);
    expect(isTrackAssetStatusDeliverable("FAILED")).toBe(false);
    expect(isTrackAssetStatusDeliverable("DELETED")).toBe(false);
  });
});
