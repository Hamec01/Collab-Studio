import { describe, expect, it } from "vitest";
import {
  acceptInviteSchema,
  createGuestLinkSchema,
  createInviteSchema,
  createProjectSchema,
  createTrackGrantSchema,
} from "../server/schemas/projects";

describe("stage3 project schemas", () => {
  it("createInviteSchema requires email or userId", () => {
    expect(() =>
      createInviteSchema.parse({
        role: "viewer",
      }),
    ).toThrow(/email or userId is required/);

    const parsed = createInviteSchema.parse({
      email: "member@example.com",
      role: "editor",
    });

    expect(parsed.scope).toBe("project");
    expect(parsed.expiresInHours).toBe(72);
  });

  it("acceptInviteSchema validates opaque token length", () => {
    expect(() => acceptInviteSchema.parse({ token: "short" })).toThrow();
    const parsed = acceptInviteSchema.parse({ token: "x".repeat(32) });
    expect(parsed.token.length).toBe(32);
  });

  it("createTrackGrantSchema applies defaults", () => {
    const parsed = createTrackGrantSchema.parse({
      userId: "550e8400-e29b-41d4-a716-446655440000",
      role: "viewer",
    });

    expect(parsed.canDownload).toBe(false);
  });

  it("createGuestLinkSchema enforces expiry bounds", () => {
    expect(() => createGuestLinkSchema.parse({ expiresInHours: 0 })).toThrow();
    const parsed = createGuestLinkSchema.parse({});
    expect(parsed.canDownload).toBe(false);
    expect(parsed.expiresInHours).toBe(48);
  });

  it("createProjectSchema requires initialTrackTitle only for singles", () => {
    expect(() => createProjectSchema.parse({
      title: "Single",
      type: "single",
    })).toThrow(/initial track title/i);

    expect(() => createProjectSchema.parse({
      title: "Album",
      type: "album",
      initialTrackTitle: "Should fail",
    })).toThrow(/must not set/i);

    expect(createProjectSchema.parse({
      title: "Single",
      type: "single",
      initialTrackTitle: "Main Track",
    }).initialTrackTitle).toBe("Main Track");
  });
});
