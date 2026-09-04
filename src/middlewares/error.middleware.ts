import type { Request, Response, NextFunction } from "express";
import multer from "multer";
import { z } from "zod";
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
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  // 1. Resource Not Found errors (DocumentNotFoundError)
  if (err instanceof DocumentNotFoundError) {
    res.status(404).json({
      status: "error",
      message: err.message,
    });
    return;
  }

  // 2. Request validation errors (Zod schema)
  if (err instanceof z.ZodError) {
    res.status(400).json({
      status: "error",
      message: err.issues[0]?.message ?? "Validation failed",
      issues: err.issues,
    });
    return;
  }

  // 3. Malformed JSON body parsed by express.json()
  if (err instanceof SyntaxError && "status" in err && (err as { status: number }).status === 400) {
    res.status(400).json({
      status: "error",
      message: "Malformed JSON payload in request body",
    });
    return;
  }

  // 4. Payload size limits
  if (err instanceof PayloadTooLargeError) {
    res.status(413).json({
      status: "error",
      message: err.message,
    });
    return;
  }

  if (err instanceof FileUploadError) {
    res.status(400).json({
      status: "error",
      message: err.message,
    });
    return;
  }

  if (err instanceof InvalidFileTypeError) {
    res.status(415).json({
      status: "error",
      message: err.message,
    });
    return;
  }

  if (err instanceof DocumentExtractionError) {
    res.status(422).json({
      status: "error",
      message: err.message,
    });
    return;
  }

  if (err instanceof SchemaValidationError) {
    res.status(422).json({
      status: "error",
      message: "AI output failed schema validation",
      issues: err.issues,
    });
    return;
  }

  if (err instanceof UpstreamAIError) {
    res.status(502).json({
      status: "error",
      message: "AI service is currently unavailable or timed out",
    });
    return;
  }

  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      res.status(413).json({
        status: "error",
        message: "File size exceeds limit of 5MB",
      });
      return;
    }
    res.status(400).json({
      status: "error",
      message: err.message,
    });
    return;
  }

  const errorType = err instanceof Error ? err.name : "UnknownError";
  console.error(`Unhandled application error (${errorType})`);
  res.status(500).json({
    status: "error",
    message: "An unexpected internal server error occurred",
  });
}
