import type { Request, Response, NextFunction } from "express";
import multer from "multer";
import { z } from "zod";
import { logger, getRequestId } from "../config/logger.js";
import {
  InvalidFileTypeError,
  DocumentExtractionError,
  SchemaValidationError,
  UpstreamAIError,
  FileUploadError,
  DocumentNotFoundError,
  PayloadTooLargeError,
} from "../errors/index.js";

/**
 * Global Express centralized error handling middleware.
 * Maps domain and library errors to consistent, safe HTTP status responses.
 */
export function errorHandlerMiddleware(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const requestId = (req.id as string) || getRequestId();

  const logHandledError = (statusCode: number, errorType: string, safeMessage?: string) => {
    logger.warn(
      {
        operation: "http_request_error",
        requestId,
        errorType,
        statusCode,
        path: req.path,
        method: req.method,
        ...(safeMessage ? { message: safeMessage } : {}),
      },
      `Handled request error (${errorType})`,
    );
  };

  // 1. Resource Not Found errors (DocumentNotFoundError)
  if (err instanceof DocumentNotFoundError) {
    logHandledError(404, "DocumentNotFoundError");
    res.status(404).json({
      status: "error",
      message: err.message,
    });
    return;
  }

  // 2. Request validation errors (Zod schema)
  if (err instanceof z.ZodError) {
    logHandledError(400, "ZodError", "Validation failed");
    res.status(400).json({
      status: "error",
      message: err.issues[0]?.message ?? "Validation failed",
      issues: err.issues,
    });
    return;
  }

  // 3. Malformed JSON body parsed by express.json()
  if (err instanceof SyntaxError && "status" in err && (err as { status: number }).status === 400) {
    logHandledError(400, "SyntaxError", "Malformed JSON payload");
    res.status(400).json({
      status: "error",
      message: "Malformed JSON payload in request body",
    });
    return;
  }

  // 4. Payload size limits
  if (err instanceof PayloadTooLargeError) {
    logHandledError(413, "PayloadTooLargeError");
    res.status(413).json({
      status: "error",
      message: err.message,
    });
    return;
  }

  if (err instanceof FileUploadError) {
    logHandledError(400, "FileUploadError");
    res.status(400).json({
      status: "error",
      message: err.message,
    });
    return;
  }

  if (err instanceof InvalidFileTypeError) {
    logHandledError(415, "InvalidFileTypeError");
    res.status(415).json({
      status: "error",
      message: err.message,
    });
    return;
  }

  if (err instanceof DocumentExtractionError) {
    logHandledError(422, "DocumentExtractionError");
    res.status(422).json({
      status: "error",
      message: err.message,
    });
    return;
  }

  if (err instanceof SchemaValidationError) {
    logHandledError(422, "SchemaValidationError");
    res.status(422).json({
      status: "error",
      message: "AI output failed schema validation",
      issues: err.issues,
    });
    return;
  }

  if (err instanceof UpstreamAIError) {
    logHandledError(502, "UpstreamAIError");
    res.status(502).json({
      status: "error",
      message: "AI service is currently unavailable or timed out",
    });
    return;
  }

  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      logHandledError(413, "MulterError", "File size limit exceeded");
      res.status(413).json({
        status: "error",
        message: "File size exceeds limit of 5MB",
      });
      return;
    }
    logHandledError(400, "MulterError");
    res.status(400).json({
      status: "error",
      message: err.message,
    });
    return;
  }

  const errorType = err instanceof Error ? err.name : "UnknownError";
  logger.error(
    {
      operation: "http_request_error",
      requestId,
      errorType,
      statusCode: 500,
      path: req.path,
      method: req.method,
    },
    `Unhandled application error (${errorType})`,
  );
  res.status(500).json({
    status: "error",
    message: "An unexpected internal server error occurred",
  });
}
