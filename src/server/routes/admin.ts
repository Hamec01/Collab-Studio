import { Router, type Request, type Response } from "express";
import { prisma } from "../db";
import { requireAuth } from "../middleware/auth";
import { AppError } from "../middleware/errors";

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

router.get("/reports", async (req: Request, res: Response) => {
  const reports = await prisma.contentReport.findMany({
    where: { status: "PENDING" },
    include: {
      reporter: { select: { username: true, displayName: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  res.json({ reports });
});

router.post("/reports/:id/resolve", async (req: Request, res: Response) => {
  const { id } = req.params;
  const { action, resolution } = req.body; // action: "RESOLVED" | "DISMISSED"

  const report = await prisma.contentReport.update({
    where: { id },
    data: {
      status: action,
      resolution,
    },
  });
  res.json({ report });
});

router.get("/stats", async (req: Request, res: Response) => {
  const [totalUsers, totalPublications, pendingReports] = await Promise.all([
    prisma.user.count(),
    prisma.publication.count({ where: { status: "PUBLISHED" } }),
    prisma.contentReport.count({ where: { status: "PENDING" } }),
  ]);
  res.json({ stats: { totalUsers, totalPublications, pendingReports } });
});

export default router;
