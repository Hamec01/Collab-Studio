import { test, describe, afterEach } from "node:test";
import * as assert from "node:assert/strict";
import { prisma } from "../db";
import { isProjectReady } from "./export";

describe("Export Service", () => {
  afterEach(async () => {
    await prisma.trackReview.deleteMany();
    await prisma.trackSnapshot.deleteMany();
    await prisma.track.deleteMany();
    await prisma.project.deleteMany();
  });

  test("isProjectReady returns false for empty project", async () => {
    const project = await prisma.project.create({
      data: {
        title: "Test Project",
        type: "single",
      },
    });

    const ready = await isProjectReady(project.id);
    assert.equal(ready, false);
  });
});
