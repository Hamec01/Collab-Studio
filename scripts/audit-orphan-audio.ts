import { PrismaClient } from "@prisma/client";
import { promises as fsp } from "node:fs";
import path from "node:path";

type AuditStats = {
  referenced: number;
  existing: number;
  orphan: number;
  missing: number;
};

const prisma = new PrismaClient();

function isContained(root: string, candidate: string) {
  const relative = path.relative(root, candidate);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

async function walkFiles(root: string) {
  const files: string[] = [];

  async function walk(current: string) {
    const entries = await fsp.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const next = path.join(current, entry.name);
      const relative = path.relative(root, next);
      if (!isContained(root, next)) {
        throw new Error("Invalid uploads path containment");
      }

      const stat = await fsp.lstat(next);
      if (stat.isSymbolicLink()) {
        throw new Error("Uploads tree contains symlink");
      }

      if (entry.isDirectory()) {
        await walk(next);
      } else if (entry.isFile()) {
        files.push(relative);
      }
    }
  }

  await walk(root);
  return files;
}

async function pruneEmptyDirectories(root: string) {
  async function prune(current: string) {
    const entries = await fsp.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        await prune(path.join(current, entry.name));
      }
    }

    if (current !== root) {
      const remaining = await fsp.readdir(current);
      if (remaining.length === 0) {
        await fsp.rmdir(current);
      }
    }
  }

  await prune(root);
}

async function main() {
  const deleteEnabled = process.argv.includes("--delete");
  const uploadsDir = process.env.UPLOADS_DIR;

  if (!uploadsDir) {
    throw new Error("UPLOADS_DIR is not set");
  }

  const uploadsRoot = path.resolve(uploadsDir);

  const audioVersions = await prisma.audioVersion.findMany({
    where: { isExternal: false, storageKey: { not: null } },
    select: { storageKey: true },
  });

  const referenced = new Set<string>();
  for (const audio of audioVersions) {
    if (audio.storageKey) referenced.add(audio.storageKey);
  }

  let files: string[];
  try {
    files = await walkFiles(uploadsRoot);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Failed to scan uploads tree");
    process.exitCode = 1;
    return;
  }

  const orphans = files.filter((file) => !referenced.has(file));
  const missing = [...referenced].filter((file) => !files.includes(file));

  if (deleteEnabled) {
    for (const orphan of orphans) {
      const absolute = path.resolve(uploadsRoot, orphan);
      if (!isContained(uploadsRoot, absolute)) {
        throw new Error("Invalid orphan containment");
      }
      const stat = await fsp.lstat(absolute);
      if (stat.isSymbolicLink()) {
        throw new Error("Uploads tree contains symlink");
      }
      if (stat.isFile()) {
        await fsp.unlink(absolute);
      }
    }
    await pruneEmptyDirectories(uploadsRoot);
  }

  const stats: AuditStats = {
    referenced: referenced.size,
    existing: files.length,
    orphan: orphans.length,
    missing: missing.length,
  };

  console.log(JSON.stringify(stats));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Failed to audit orphan audio");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });