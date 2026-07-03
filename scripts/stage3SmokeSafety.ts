import path from "node:path";
import dotenv from "dotenv";

export const STAGE3_SMOKE_PREFIX = "stage3-smoke";
export const DEFAULT_STAGE3_SMOKE_ENV_FILE = "/home/deploy/secrets/collab-studio.env";

type SmokeDatabaseTarget = {
  hostname: string;
  port: string;
  database: string;
};

export function hasStage3SmokeMarker(value: string | null | undefined) {
  return typeof value === "string" && value.startsWith(STAGE3_SMOKE_PREFIX);
}

export function assertStage3SmokeMarker(value: string | null | undefined, label: string) {
  if (!hasStage3SmokeMarker(value)) {
    throw new Error(`Refusing to operate on non-smoke ${label}`);
  }
}

export function assertSafeUploadFilePath(filePath: string, uploadsRoot: string) {
  const resolvedRoot = path.resolve(uploadsRoot);
  const resolvedFile = path.resolve(filePath);

  if (!resolvedFile.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error("Refusing to remove file outside uploads root");
  }

  if (!resolvedFile.includes(STAGE3_SMOKE_PREFIX)) {
    throw new Error("Refusing to remove upload without stage3-smoke marker");
  }
}

export function makeStage3SmokeName(runId: string, suffix: string) {
  return `${STAGE3_SMOKE_PREFIX}-${runId}-${suffix}`;
}

function parseDatabaseTarget(databaseUrl: string): SmokeDatabaseTarget {
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL is not a valid URL");
  }

  if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
    throw new Error("DATABASE_URL must use postgres/postgresql protocol");
  }

  const database = parsed.pathname.replace(/^\/+/, "");
  if (!database) {
    throw new Error("DATABASE_URL must include a database name");
  }

  return {
    hostname: parsed.hostname,
    port: parsed.port || "5432",
    database,
  };
}

function isLocalDatabaseHost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

export function formatSmokeDatabaseDiagnostics(databaseUrl: string) {
  const target = parseDatabaseTarget(databaseUrl);
  return `hostname=${target.hostname} port=${target.port} database=${target.database}`;
}

export function assertAllowedSmokeDatabase(databaseUrl: string, allowLocalDb: boolean) {
  const target = parseDatabaseTarget(databaseUrl);
  if (!allowLocalDb && isLocalDatabaseHost(target.hostname)) {
    throw new Error("Refusing to run stage3 smoke against localhost DB without SMOKE_ALLOW_LOCAL_DB=true");
  }
}

export function initializeSmokeDatabaseEnv(envFile = process.env.ENV_FILE ?? DEFAULT_STAGE3_SMOKE_ENV_FILE) {
  dotenv.config({ path: envFile, override: true });

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(`DATABASE_URL is required (source: ${envFile})`);
  }

  const allowLocalDb = process.env.SMOKE_ALLOW_LOCAL_DB === "true";
  assertAllowedSmokeDatabase(databaseUrl, allowLocalDb);

  return {
    envFile,
    databaseUrl,
    diagnostics: formatSmokeDatabaseDiagnostics(databaseUrl),
  };
}
