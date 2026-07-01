import { Router, type NextFunction, type Request, type Response } from "express";
import { prisma } from "../db";
import { requireAuth } from "../middleware/auth";
import { AppError } from "../middleware/errors";
import { notificationParamsSchema, notificationQuerySchema } from "../schemas/notifications";
import { collaborationUserSelect, serializeNotification } from "../serializers/collaboration";

const router = Router();

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;
const asyncHandler = (handler: AsyncHandler) => (req: Request, res: Response, next: NextFunction) => {
  handler(req, res, next).catch(next);
};

const notificationInclude = {
  actor: { select: collaborationUserSelect },
  project: { select: { id: true, title: true } },
  track: { select: { id: true, title: true } },
} as const;

function requireCurrentUser(req: Request) {
  if (!req.user) throw new AppError(401, "UNAUTHENTICATED", "Authentication required");
  return req.user;
}

router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = requireCurrentUser(req);
    const { limit } = notificationQuerySchema.parse(req.query);
    const notifications = await prisma.notification.findMany({
      where: { userId: user.id },
      include: notificationInclude,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit,
    });
    res.json(notifications.map(serializeNotification));
  }),
);

router.post(
  "/read-all",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = requireCurrentUser(req);
    const result = await prisma.notification.updateMany({
      where: { userId: user.id, read: false },
      data: { read: true },
    });
    res.json({ success: true, updated: result.count });
  }),
);

router.post(
  "/:notificationId/read",
  (req, _res, next) => {
    notificationParamsSchema.parse(req.params);
    next();
  },
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = requireCurrentUser(req);
    const { notificationId } = notificationParamsSchema.parse(req.params);
    const result = await prisma.notification.updateMany({
      where: { id: notificationId, userId: user.id },
      data: { read: true },
    });
    if (result.count === 0) throw new AppError(404, "NOTIFICATION_NOT_FOUND", "Notification not found");
    res.json({ success: true });
  }),
);

export default router;
