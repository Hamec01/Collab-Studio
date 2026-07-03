import os from "node:os";
import path from "node:path";
import { promises as fsp } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_STAGE3_SMOKE_ENV_FILE,
  STAGE3_SMOKE_PREFIX,
  assertAllowedSmokeDatabase,
  assertSafeUploadFilePath,
  assertStage3SmokeMarker,
  formatSmokeDatabaseDiagnostics,
  hasStage3SmokeMarker,
  initializeSmokeDatabaseEnv,
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

  it("initializeSmokeDatabaseEnv overrides inherited DATABASE_URL via ENV_FILE", async () => {
    const previousEnvFile = process.env.ENV_FILE;
    const previousDatabaseUrl = process.env.DATABASE_URL;
    const previousAllowLocal = process.env.SMOKE_ALLOW_LOCAL_DB;
    const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), "stage3-smoke-env-"));
    const envFile = path.join(tempDir, "smoke.env");

    try {
      await fsp.writeFile(envFile, "DATABASE_URL=postgresql://file-user:file-pass@db.example.com:5432/smoke_db\n", "utf8");
      process.env.ENV_FILE = envFile;
      process.env.DATABASE_URL = "postgresql://inherited-user:inherited-pass@127.0.0.1:55433/test_db";
      process.env.SMOKE_ALLOW_LOCAL_DB = "false";

      const initialized = initializeSmokeDatabaseEnv(process.env.ENV_FILE ?? DEFAULT_STAGE3_SMOKE_ENV_FILE);
      expect(initialized.databaseUrl).toBe("postgresql://file-user:file-pass@db.example.com:5432/smoke_db");
      expect(process.env.DATABASE_URL).toBe("postgresql://file-user:file-pass@db.example.com:5432/smoke_db");
    } finally {
      if (previousEnvFile === undefined) delete process.env.ENV_FILE;
      else process.env.ENV_FILE = previousEnvFile;

      if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previousDatabaseUrl;

      if (previousAllowLocal === undefined) delete process.env.SMOKE_ALLOW_LOCAL_DB;
      else process.env.SMOKE_ALLOW_LOCAL_DB = previousAllowLocal;

      await fsp.rm(tempDir, { recursive: true, force: true });
    }
  });

  it("rejects localhost database target unless explicitly allowed", () => {
    expect(() =>
      assertAllowedSmokeDatabase("postgresql://user:pass@127.0.0.1:5432/collab_smoke", false),
    ).toThrow(/Refusing to run stage3 smoke against localhost DB/);

    expect(() =>
      assertAllowedSmokeDatabase("postgresql://user:pass@127.0.0.1:5432/collab_smoke", true),
    ).not.toThrow();
  });

  it("diagnostics omit secrets and full database URL", () => {
    const databaseUrl = "postgresql://db-user:super-secret@prod-db.internal:6543/collab_studio";
    const diagnostics = formatSmokeDatabaseDiagnostics(databaseUrl);

    expect(diagnostics).toContain("hostname=prod-db.internal");
    expect(diagnostics).toContain("port=6543");
    expect(diagnostics).toContain("database=collab_studio");
    expect(diagnostics).not.toContain("db-user");
    expect(diagnostics).not.toContain("super-secret");
    expect(diagnostics).not.toContain(databaseUrl);
  });
});
