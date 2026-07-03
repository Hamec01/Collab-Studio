import { PrismaClient } from "@prisma/client";
import { backfillStructuredLyrics } from "../src/server/services/lyricsBackfill";

function readPositiveInteger(name: string, fallback?: number) {
  const argument = process.argv.find((value) => value.startsWith(`--${name}=`));
  if (!argument) return fallback;
  const value = Number(argument.slice(name.length + 3));
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`--${name} must be a positive integer`);
  }
  return value;
}

function assertSafeDatabaseUrl(databaseUrl: string | undefined) {
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const parsed = new URL(databaseUrl);
  const isLoopback = parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost" || parsed.hostname === "::1";
  if (!isLoopback && process.env.STAGE4B_ALLOW_REMOTE_BACKFILL !== "true") {
    throw new Error("Remote backfill is disabled; set STAGE4B_ALLOW_REMOTE_BACKFILL=true only for a coordinated run");
  }
}

async function main() {
  assertSafeDatabaseUrl(process.env.DATABASE_URL);
  const prisma = new PrismaClient();
  try {
    const result = await backfillStructuredLyrics(prisma, {
      batchSize: readPositiveInteger("batch-size", 100),
      maxBatches: readPositiveInteger("max-batches"),
    });
    console.log(JSON.stringify(result));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
