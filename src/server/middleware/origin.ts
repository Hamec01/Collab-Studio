import type { NextFunction, Request, Response } from "express";
import { getConfig } from "../config";
import { sendError } from "./errors";

const mutatingMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function isLoopbackHost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function isTrustedOrigin(origin: string, appUrl: string) {
  const allowed = new URL(appUrl);
  const incoming = new URL(origin);

  if (incoming.protocol !== allowed.protocol || incoming.port !== allowed.port) {
    return false;
  }

  if (incoming.hostname === allowed.hostname) {
    return true;
  }

  // Treat loopback host aliases as equivalent for local development/forwarded URLs.
  return isLoopbackHost(incoming.hostname) && isLoopbackHost(allowed.hostname);
}

function parseHostName(value: string | undefined) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("[")) {
    const close = trimmed.indexOf("]");
    return close > 1 ? trimmed.slice(1, close) : null;
  }

  const host = trimmed.split(":")[0];
  return host || null;
}

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

  if (!isTrustedOrigin(origin, getConfig().APP_URL)) {
    try {
      const incoming = new URL(origin);
      const requestHost = parseHostName(req.header("x-forwarded-host") ?? req.header("host") ?? undefined);
      if (requestHost && isLoopbackHost(requestHost) && isLoopbackHost(incoming.hostname)) {
        next();
        return;
      }
    } catch {
      // Invalid origin falls through to the default rejection path.
    }

    sendError(res, 403, "INVALID_ORIGIN", "Invalid request origin", req.requestId);
    return;
  }

  next();
}
