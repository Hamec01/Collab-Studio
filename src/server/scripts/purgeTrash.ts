import { prisma } from "../db";
import { removeProjectUploadsTree } from "../services/audioVersions";

async function purgeTrash() {
  const force = process.argv.includes("--force-final");
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const projectsToPurge = await prisma.project.findMany({
    where: {
      deletedAt: {
        lte: thirtyDaysAgo,
      },
    },
    include: {
      tracks: {
        include: {
          assets: { where: { isPrimary: true, status: "READY" } },
        },
      },
    },
  });

  if (projectsToPurge.length === 0) {
    console.log("No projects to purge.");
    return;
  }

  for (const project of projectsToPurge) {
    const hasFinalAssets = project.tracks.some((t) => t.assets.length > 0);

    if (hasFinalAssets && !force) {
      console.warn(`[SKIP] Project ${project.id} (${project.title}) contains final assets and was skipped. Use --force-final to override.`);
      continue;
    }

    console.log(`[PURGE] Deleting project ${project.id} (${project.title})...`);
    try {
      await prisma.$transaction(async (tx) => {
        await tx.project.delete({ where: { id: project.id } });
      });
      await removeProjectUploadsTree(project.id);
      console.log(`[SUCCESS] Purged project ${project.id}.`);
    } catch (err) {
      console.error(`[ERROR] Failed to purge project ${project.id}:`, err);
    }
  }
}

purgeTrash().then(() => process.exit(0)).catch((err) => {
  console.error("Purge failed:", err);
  process.exit(1);
});
