import { Router, type NextFunction, type Request, type Response } from "express";
import { requireAuth } from "../middleware/auth";
import { AppError } from "../middleware/errors";
import { z } from "zod";
import {
  sendDmRequest,
  listIncomingDmRequests,
  listAcceptedConversations,
  respondToDmRequest,
  listConversationMessages,
  sendDirectMessage,
} from "../services/dm";

const router = Router();

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;
const asyncHandler = (handler: AsyncHandler) => (req: Request, res: Response, next: NextFunction) => {
  handler(req, res, next).catch(next);
};

const sendRequestSchema = z.object({
  handle: z.string().min(1),
  text: z.string().min(1).max(1000),
});

const sendMessageSchema = z.object({
  text: z.string().min(1).max(2000),
});

const respondSchema = z.object({
  action: z.enum(["accept", "reject", "block"]),
});

// 1. Send a DM request to a user
router.post(
  "/dm/requests",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.user) throw new AppError(401, "UNAUTHENTICATED", "Authentication required");
    const { handle, text } = sendRequestSchema.parse(req.body);
    const request = await sendDmRequest(req.user.id, handle, text);
    res.json({ request });
  }),
);

// 2. List incoming pending DM requests
router.get(
  "/dm/requests",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.user) throw new AppError(401, "UNAUTHENTICATED", "Authentication required");
    const requests = await listIncomingDmRequests(req.user.id);
    res.json({ requests });
  }),
);

// 3. List accepted conversations
router.get(
  "/dm/conversations",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.user) throw new AppError(401, "UNAUTHENTICATED", "Authentication required");
    const conversations = await listAcceptedConversations(req.user.id);
    res.json({ conversations });
  }),
);

// 4. Accept / Reject / Block a DM request
router.post(
  "/dm/requests/:id/respond",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.user) throw new AppError(401, "UNAUTHENTICATED", "Authentication required");
    const { action } = respondSchema.parse(req.body);
    const request = await respondToDmRequest(req.user.id, req.params.id, action);
    res.json({ request });
  }),
);

// 5. List messages in an accepted conversation
router.get(
  "/dm/conversations/:id/messages",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.user) throw new AppError(401, "UNAUTHENTICATED", "Authentication required");
    const messages = await listConversationMessages(req.user.id, req.params.id);
    res.json({ messages });
  }),
);

// 6. Send a message in an accepted conversation
router.post(
  "/dm/conversations/:id/messages",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.user) throw new AppError(401, "UNAUTHENTICATED", "Authentication required");
    const { text } = sendMessageSchema.parse(req.body);
    const message = await sendDirectMessage(req.user.id, req.params.id, text);
    res.json({ message });
  }),
);

export default router;
