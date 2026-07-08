import { Router, type NextFunction, type Request, type Response } from "express";
import { requireAuth, optionalAuth } from "../middleware/auth";
import { AppError } from "../middleware/errors";
import { z } from "zod";
import {
  addPublicationComment,
  getPublicationComments,
  toggleCommentsClosed,
  toggleCommentHidden,
  blockUser,
  unblockUser,
  createContentReport,
  getPendingReports,
  resolveReport,
} from "../services/comments";

const router = Router();

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;
const asyncHandler = (handler: AsyncHandler) => (req: Request, res: Response, next: NextFunction) => {
  handler(req, res, next).catch(next);
};

// Zod validation schemas
const createCommentSchema = z.object({
  text: z.string().min(1, "Comment text cannot be empty").max(1000, "Comment too long"),
});

const closeCommentsSchema = z.object({
  closed: z.boolean(),
});

const hideCommentSchema = z.object({
  hidden: z.boolean(),
});

const reportSchema = z.object({
  contentType: z.enum(["PUBLICATION", "COMMENT"]),
  contentId: z.string().uuid("Invalid content ID"),
  reason: z.string().min(1, "Reason is required").max(1000),
});

const resolveReportSchema = z.object({
  action: z.enum(["SUSPEND_USER", "BAN_USER", "REMOVE_CONTENT", "DISMISS"]),
  resolution: z.string().min(1, "Resolution description is required").max(1000),
});

// 1. Comments list (public)
router.get(
  "/publications/:slug/comments",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const viewerId = req.user?.id ?? null;
    const comments = await getPublicationComments(viewerId, req.params.slug);
    res.json({ comments });
  }),
);

// 2. Add a comment (private, verified write check inside service)
router.post(
  "/publications/:slug/comments",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.user) throw new AppError(401, "UNAUTHENTICATED", "Authentication required");
    const { text } = createCommentSchema.parse(req.body);
    const comment = await addPublicationComment(req.user.id, req.params.slug, text);
    res.json({ comment });
  }),
);

// 3. Toggle comment thread closed status (publication author only)
router.post(
  "/publications/:slug/comments/close",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.user) throw new AppError(401, "UNAUTHENTICATED", "Authentication required");
    const { closed } = closeCommentsSchema.parse(req.body);
    await toggleCommentsClosed(req.user.id, req.params.slug, closed);
    res.json({ success: true });
  }),
);

// 4. Hide/Show specific comment (publication author only)
router.post(
  "/comments/:commentId/hide",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.user) throw new AppError(401, "UNAUTHENTICATED", "Authentication required");
    const { hidden } = hideCommentSchema.parse(req.body);
    const comment = await toggleCommentHidden(req.user.id, req.params.commentId, hidden);
    res.json({ comment });
  }),
);

// 5. Block User (globally for blockers own publications)
router.post(
  "/users/:handle/block",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.user) throw new AppError(401, "UNAUTHENTICATED", "Authentication required");
    await blockUser(req.user.id, req.params.handle);
    res.json({ success: true });
  }),
);

// 6. Unblock User
router.post(
  "/users/:handle/unblock",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.user) throw new AppError(401, "UNAUTHENTICATED", "Authentication required");
    await unblockUser(req.user.id, req.params.handle);
    res.json({ success: true });
  }),
);

// 7. Content Report (private)
router.post(
  "/reports",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.user) throw new AppError(401, "UNAUTHENTICATED", "Authentication required");
    const { contentType, contentId, reason } = reportSchema.parse(req.body);
    const report = await createContentReport(req.user.id, contentType, contentId, reason);
    res.json({ report });
  }),
);

// 8. Admin: Get Pending Reports
router.get(
  "/admin/reports",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.user) throw new AppError(401, "UNAUTHENTICATED", "Authentication required");
    const reports = await getPendingReports(req.user.id);
    res.json({ reports });
  }),
);

// 9. Admin: Resolve Content Report
router.post(
  "/admin/reports/:reportId/resolve",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.user) throw new AppError(401, "UNAUTHENTICATED", "Authentication required");
    const { action, resolution } = resolveReportSchema.parse(req.body);
    await resolveReport(req.user.id, req.params.reportId, action, resolution);
    res.json({ success: true });
  }),
);

export default router;
