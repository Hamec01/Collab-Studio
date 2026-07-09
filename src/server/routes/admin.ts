import { Router, type Request, type Response } from "express";
import { prisma } from "../db";
import { requireAuth } from "../middleware/auth";
import { AppError } from "../middleware/errors";
import os from "node:os";
import fs from "node:fs/promises";

const router = Router();

router.use(requireAuth);
router.use((req: Request, res: Response, next) => {
  if (req.user?.role !== "admin") {
    throw new AppError(403, "Admin access required", "ADMIN_REQUIRED");
  }
  next();
});

router.get("/users", async (req: Request, res: Response) => {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      username: true,
      displayName: true,
      email: true,
      role: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: 100, // simple pagination limit for now
  });
  res.json({ users });
});

router.post("/users/:id/suspend", async (req: Request, res: Response) => {
  const { id } = req.params;
  const { action } = req.body; // "suspend" | "restore"
  if (id === req.user!.id) {
    throw new AppError(400, "Cannot suspend yourself", "CANNOT_SUSPEND_SELF");
  }
  const user = await prisma.user.update({
    where: { id },
    data: { deletedAt: action === "suspend" ? new Date() : null },
    select: { id: true, username: true, role: true, deletedAt: true },
  });
  res.json({ user });
});



router.get("/stats", async (req: Request, res: Response) => {
  const [totalUsers, totalPublications, pendingReports] = await Promise.all([
    prisma.user.count(),
    prisma.publication.count({ where: { status: "PUBLISHED" } }),
    prisma.contentReport.count({ where: { status: "PENDING" } }),
  ]);
  res.json({ stats: { totalUsers, totalPublications, pendingReports } });
});

router.get("/system", async (req: Request, res: Response) => {
  let diskUsagePercent = 0;
  try {
    const stat = await fs.statfs("/");
    const total = stat.blocks * stat.bsize;
    const free = stat.bavail * stat.bsize;
    diskUsagePercent = ((total - free) / total) * 100;
  } catch (e) {
    // Ignore if not available
  }
  
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const memUsagePercent = ((totalMem - freeMem) / totalMem) * 100;

  const alerts = [];
  if (diskUsagePercent > 85) alerts.push("DISK_CRITICAL");
  else if (diskUsagePercent > 70) alerts.push("DISK_WARNING");
  
  if (memUsagePercent > 85) alerts.push("MEMORY_WARNING");

  res.json({
    system: {
      diskUsagePercent: Math.round(diskUsagePercent * 100) / 100,
      memUsagePercent: Math.round(memUsagePercent * 100) / 100,
      alerts
    }
  });
});

export default router;
