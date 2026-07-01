import { Prisma } from "@prisma/client";
import type { ErrorRequestHandler, Request, Response } from "express";
import { ZodError } from "zod";

export class AppError extends Error {
  statusCode: number;
  code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function sendError(res: Response, statusCode: number, code: string, message: string, requestId?: string) {
  res.status(statusCode).json({
    error: {
      code,
      message,
      requestId,
    },
  });
}

export const notFound = (req: Request, res: Response) => {
  sendError(res, 404, "NOT_FOUND", "Not found", req.requestId);
};

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (res.headersSent) return;

  if (err instanceof ZodError) {
    sendError(res, 400, "VALIDATION_ERROR", "Invalid request body", req.requestId);
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const knownErrors: Record<string, { status: number; code: string; message: string }> = {
      P2002: { status: 409, code: "UNIQUE_CONFLICT", message: "Resource already exists" },
      P2003: { status: 409, code: "RELATION_CONFLICT", message: "Related resource changed" },
      P2025: { status: 404, code: "RESOURCE_NOT_FOUND", message: "Resource not found" },
      P2034: { status: 409, code: "TRANSACTION_CONFLICT", message: "Concurrent update conflict; retry the request" },
    };
    const mapped = knownErrors[err.code];
    if (mapped) {
      sendError(res, mapped.status, mapped.code, mapped.message, req.requestId);
      return;
    }
  }

  if (err instanceof AppError) {
    sendError(res, err.statusCode, err.code, err.message, req.requestId);
    return;
  }

  console.error("Unhandled request error", {
    requestId: req.requestId,
    method: req.method,
    path: req.path,
    message: err instanceof Error ? err.message : String(err),
  });

  const message = process.env.NODE_ENV === "production" ? "Internal server error" : err instanceof Error ? err.message : "Internal server error";
  sendError(res, 500, "INTERNAL_SERVER_ERROR", message, req.requestId);
};
