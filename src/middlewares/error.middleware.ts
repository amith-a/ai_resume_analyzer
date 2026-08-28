import { Request, Response, NextFunction } from "express";
import multer from "multer";
import {
  InvalidFileTypeError,
  DocumentExtractionError,
  SchemaValidationError,
  UpstreamAIError,
} from "../errors/index.js";

/**
 * Global Express centralized error handling middleware.
 * Maps domain and library errors to consistent, safe HTTP status responses.
 */
export function errorHandlerMiddleware(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
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

  console.error("Unhandled application error:", err);
  res.status(500).json({
    status: "error",
    message: "An unexpected internal server error occurred",
  });
}
