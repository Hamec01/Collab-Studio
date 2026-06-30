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
