import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { sendError } from "./errors";

function rateLimitIdentity(req: Parameters<NonNullable<Parameters<typeof rateLimit>[0]["handler"]>>[0]) {
  if (req.session?.userId) return `uid:${req.session.userId}`;
  if (req.sessionID) return `sid:${req.sessionID}`;
  return ipKeyGenerator(req.ip);
}

function isWorkspaceReadPath(path: string) {
  return (
    path === "/projects"
    || path.startsWith("/projects/")
    || path === "/notifications"
    || path.startsWith("/notifications/")
    || path === "/publications/mine"
  );
}

export const apiRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 2000,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: rateLimitIdentity,
  skip: (req) => (
    Boolean(req.session?.userId)
    || (req.method === "GET" && isWorkspaceReadPath(req.path))
    || req.path === "/health"
    || req.path === "/ready"
    || req.path === "/auth/providers"
    || req.path === "/auth/me"
  ),
  handler: (req, res) => sendError(res, 429, "RATE_LIMITED", "Too many requests", req.requestId),
});

export const authRateLimit = rateLimit({
  // Generic auth flow limiter for non-login endpoints (verify/reset/google flow).
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: rateLimitIdentity,
  skipSuccessfulRequests: true,
  handler: (req, res) => sendError(res, 429, "AUTH_RATE_LIMITED", "Too many authentication attempts", req.requestId),
});

export const authLoginRateLimit = rateLimit({
  // Keep login protected while avoiding accidental lockout from other auth endpoints.
  windowMs: 10 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: rateLimitIdentity,
  skipSuccessfulRequests: true,
  handler: (req, res) => sendError(res, 429, "AUTH_LOGIN_RATE_LIMITED", "Too many login attempts", req.requestId),
});

export const inviteRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.session.userId ?? "unauthenticated",
  handler: (req, res) => sendError(res, 429, "INVITE_RATE_LIMITED", "Too many invite attempts", req.requestId),
});

export const geminiIpRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => sendError(res, 429, "GEMINI_RATE_LIMITED", "Too many Gemini requests", req.requestId),
});

export const geminiUserRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id ?? "unauthenticated",
  handler: (req, res) => sendError(res, 429, "GEMINI_RATE_LIMITED", "Too many Gemini requests", req.requestId),
});

export const publicCommentRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.session?.userId ?? "unauthenticated",
  handler: (req, res) => sendError(res, 429, "COMMENT_RATE_LIMITED", "Too many comments submitted", req.requestId),
});

export const publicDmRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.session?.userId ?? "unauthenticated",
  handler: (req, res) => sendError(res, 429, "DM_RATE_LIMITED", "Too many direct message requests", req.requestId),
});
