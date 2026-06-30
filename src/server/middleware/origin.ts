import type { NextFunction, Request, Response } from "express";
import { getConfig } from "../config";
import { sendError } from "./errors";

const mutatingMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function requireTrustedOrigin(req: Request, res: Response, next: NextFunction) {
  if (!mutatingMethods.has(req.method)) {
    next();
    return;
  }

  const origin = req.header("origin");
  const fetchSite = req.header("sec-fetch-site");

  if (!origin) {
    if (fetchSite && fetchSite !== "none") {
      sendError(res, 403, "INVALID_ORIGIN", "Invalid request origin", req.requestId);
      return;
    }
    // No Origin is allowed only for explicit non-browser clients such as CLI/server-to-server calls.
    next();
    return;
  }

  const allowedOrigin = new URL(getConfig().APP_URL).origin;
  if (origin !== allowedOrigin) {
    sendError(res, 403, "INVALID_ORIGIN", "Invalid request origin", req.requestId);
    return;
  }

  next();
}
