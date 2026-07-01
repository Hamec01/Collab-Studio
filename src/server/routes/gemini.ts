import { Router, type NextFunction, type Request, type Response } from "express";
import { getConfig } from "../config";
import { requireAuth } from "../middleware/auth";
import { geminiIpRateLimit, geminiUserRateLimit } from "../middleware/rateLimits";
import { rhymeRequestSchema } from "../schemas/gemini";
import { generateRhymes } from "../services/gemini";

const router = Router();

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;
const asyncHandler = (handler: AsyncHandler) => (req: Request, res: Response, next: NextFunction) => {
  handler(req, res, next).catch(next);
};

router.post(
  "/rhymes",
  requireAuth,
  geminiIpRateLimit,
  geminiUserRateLimit,
  asyncHandler(async (req, res) => {
    const input = rhymeRequestSchema.parse(req.body);
    const result = await generateRhymes(input, getConfig().GEMINI_API_KEY);
    res.json(result);
  }),
);

export default router;
