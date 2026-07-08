import { Router, type Request } from "express";
import { requireAuth } from "../middleware/auth";
import { AppError } from "../middleware/errors";
import { ensureVerifiedForProtectedWrite } from "../services/stage3Access";

const router = Router();

function requireCurrentUser(req: Request) {
  if (!req.user) throw new AppError(401, "UNAUTHENTICATED", "Authentication required");
  return req.user;
}

router.post("/dm", requireAuth, (req, _res, next) => {
  try {
    const user = requireCurrentUser(req);
    ensureVerifiedForProtectedWrite({
      emailVerifiedAt: user.emailVerifiedAt,
      ageAcknowledgedAt: user.ageAcknowledgedAt,
    });
    throw new AppError(403, "FEATURE_NOT_AVAILABLE", "Direct messages are not available in this stage");
  } catch (error) {
    next(error);
  }
});

export default router;
