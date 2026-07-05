import { PrismaClient } from "@prisma/client";
import { backfillTrackAssets } from "../src/server/services/trackAssetBackfill";

function readFlag(name: string) {
  return process.argv.includes(`--${name}`);
}

function readString(name: string) {
  const argument = process.argv.find((value) => value.startsWith(`--${name}=`));
  return argument ? argument.slice(name.length + 3) : undefined;
}

function readPositiveInteger(name: string) {
  const value = readString(name);
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`--${name} must be a positive integer`);
  }
  return parsed;
}

function assertSafeDatabaseUrl(databaseUrl: string | undefined, execute: boolean) {
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  if (!execute) return;
  if (process.env.TRACK_ASSET_BACKFILL_CONFIRM !== "YES") {
    throw new Error("Execute mode is disabled; set TRACK_ASSET_BACKFILL_CONFIRM=YES to proceed intentionally");
  }
}

async function main() {
  const execute = readFlag("execute");
  const dryRun = readFlag("dry-run");
  if (execute === dryRun) {
    throw new Error("Choose exactly one of --dry-run or --execute");
  }

  const databaseUrl = process.env.DATABASE_URL;
  assertSafeDatabaseUrl(databaseUrl, execute);

  const uploadsRoot = process.env.UPLOADS_DIR;
  if (!uploadsRoot) {
    throw new Error("UPLOADS_DIR is required");
  }

  const prisma = new PrismaClient();
  try {
    const result = await backfillTrackAssets(prisma, {
      mode: execute ? "execute" : "dry-run",
      uploadsRoot,
      batchSize: readPositiveInteger("batch-size") ?? 100,
      cursor: readString("cursor"),
      maxRows: readPositiveInteger("max-rows"),
      strictMissingFiles: readFlag("strict-missing-files"),
      failOnConflict: readFlag("fail-on-conflict"),
    });

    if (readFlag("json")) {
      console.log(JSON.stringify(result));
      return;
    }

    console.log([
      `mode=${result.mode}`,
      `scanned=${result.scanned}`,
      `eligible=${result.eligible}`,
      `created=${result.created}`,
      `wouldCreate=${result.wouldCreate}`,
      `skipped=${result.skipped}`,
      `raced=${result.raced}`,
      `external=${result.external}`,
      `localPresent=${result.localPresent}`,
      `missing=${result.missing}`,
      `conflicts=${result.conflicts}`,
      `failed=${result.failed}`,
      `batches=${result.batches}`,
      `nextCursor=${result.nextCursor ?? ""}`,
      `durationMs=${result.durationMs}`,
    ].join(" "));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
