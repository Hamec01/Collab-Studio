import { describe, expect, it } from "vitest";
import {
  buildPrivatePath,
  mobileStateFromTab,
  parsePrivatePath,
  tabFromMobileState,
} from "./routeContract";

describe("parsePrivatePath", () => {
  it("parses minimum private routes", () => {
    expect(parsePrivatePath("/app")).toEqual({
      projectId: null,
      trackId: null,
      tab: "lyrics",
      isCanonical: true,
    });

    expect(parsePrivatePath("/app/projects")).toEqual({
      projectId: null,
      trackId: null,
      tab: "lyrics",
      isCanonical: true,
    });

    expect(parsePrivatePath("/app/projects/p1")).toEqual({
      projectId: "p1",
      trackId: null,
      tab: "lyrics",
      isCanonical: true,
    });

    expect(parsePrivatePath("/app/projects/p1/tracks/t1")).toEqual({
      projectId: "p1",
      trackId: "t1",
      tab: "lyrics",
      isCanonical: true,
    });

    expect(parsePrivatePath("/app/projects/p1/tracks/t1/audio")).toEqual({
      projectId: "p1",
      trackId: "t1",
      tab: "audio",
      isCanonical: true,
    });
  });

  it("normalizes unknown tabs to lyrics", () => {
    expect(parsePrivatePath("/app/projects/p1/tracks/t1/not-real")).toEqual({
      projectId: "p1",
      trackId: "t1",
      tab: "lyrics",
      isCanonical: false,
    });
  });
});

describe("buildPrivatePath", () => {
  it("builds canonical private urls", () => {
    expect(buildPrivatePath({ projectId: null, trackId: null })).toBe("/app");
    expect(buildPrivatePath({ projectId: "p1", trackId: null })).toBe("/app/projects/p1");
    expect(buildPrivatePath({ projectId: "p1", trackId: "t1" })).toBe("/app/projects/p1/tracks/t1");
    expect(buildPrivatePath({ projectId: "p1", trackId: "t1", tab: "versions" })).toBe("/app/projects/p1/tracks/t1/versions");
  });
});

describe("mobile tab mapping", () => {
  it("maps tab to mobile state with safe defaults", () => {
    expect(mobileStateFromTab("lyrics")).toBe("editor");
    expect(mobileStateFromTab("audio")).toBe("editor");
    expect(mobileStateFromTab("versions")).toBe("editor");
    expect(mobileStateFromTab("team")).toBe("rightPanel");
  });

  it("maps mobile state to route tab", () => {
    expect(tabFromMobileState("projects")).toBe("lyrics");
    expect(tabFromMobileState("editor")).toBe("lyrics");
    expect(tabFromMobileState("rightPanel")).toBe("team");
  });
});
