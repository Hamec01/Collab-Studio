import rateLimit from "express-rate-limit";
import { sendError } from "./errors";

export const apiRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => sendError(res, 429, "RATE_LIMITED", "Too many requests", req.requestId),
});

export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: (req, res) => sendError(res, 429, "AUTH_RATE_LIMITED", "Too many authentication attempts", req.requestId),
});
