import { describe, expect, it } from "vitest";
import {
  STAGE3_SMOKE_PREFIX,
  assertSafeUploadFilePath,
  assertStage3SmokeMarker,
  hasStage3SmokeMarker,
  makeStage3SmokeName,
} from "../../scripts/stage3SmokeSafety";

describe("stage3 smoke safety helpers", () => {
  it("recognizes stage3-smoke markers", () => {
    const name = makeStage3SmokeName("run1", "owner");
    expect(hasStage3SmokeMarker(name)).toBe(true);
    expect(hasStage3SmokeMarker("other-prefix-value")).toBe(false);
  });

  it("assertStage3SmokeMarker rejects unmarked values", () => {
    expect(() => assertStage3SmokeMarker(`${STAGE3_SMOKE_PREFIX}-fixture`, "fixture")).not.toThrow();
    expect(() => assertStage3SmokeMarker("real-project", "fixture")).toThrow(/Refusing to operate/);
  });

  it("assertSafeUploadFilePath blocks non-root and non-marker paths", () => {
    expect(() =>
      assertSafeUploadFilePath("/home/deploy/app-data/collab-studio/uploads/stage3-smoke-file.wav", "/home/deploy/app-data/collab-studio/uploads"),
    ).not.toThrow();

    expect(() =>
      assertSafeUploadFilePath("/tmp/stage3-smoke-file.wav", "/home/deploy/app-data/collab-studio/uploads"),
    ).toThrow(/outside uploads root/);

    expect(() =>
      assertSafeUploadFilePath("/home/deploy/app-data/collab-studio/uploads/not-marked.wav", "/home/deploy/app-data/collab-studio/uploads"),
    ).toThrow(/without stage3-smoke marker/);
  });
});
