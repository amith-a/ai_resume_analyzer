import { z } from "zod";

/**
 * Thrown when an uploaded file's magic bytes do not match allowed MIME types (PDF, DOCX).
 * HTTP Mapping: 415 Unsupported Media Type
 */
export class InvalidFileTypeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidFileTypeError";
  }
}

/**
 * Thrown when document text extraction fails due to corruption, encryption, or empty text.
 * HTTP Mapping: 422 Unprocessable Entity
 */
export class DocumentExtractionError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "DocumentExtractionError";
    if (cause) {
      this.cause = cause;
    }
  }
}

/**
 * Thrown when LLM structured output fails defensive Zod schema validation.
 * HTTP Mapping: 422 Unprocessable Entity
 */
export class SchemaValidationError extends Error {
  public readonly issues: z.core.$ZodIssue[];

  constructor(message: string, issues: z.core.$ZodIssue[]) {
    super(message);
    this.name = "SchemaValidationError";
    this.issues = issues;
  }
}

/**
 * Thrown when an upstream AI provider (Ollama) fails, refuses connections, or times out.
 * HTTP Mapping: 502 Bad Gateway
 */
export class UpstreamAIError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "UpstreamAIError";
    if (cause) {
      this.cause = cause;
    }
  }
}

/**
 * Thrown when a requested document cannot be found in the database.
 * HTTP Mapping: 404 Not Found
 */
export class DocumentNotFoundError extends Error {
  constructor(message: string = "Document not found") {
    super(message);
    this.name = "DocumentNotFoundError";
  }
}

/**
 * Thrown when an uploaded file is missing or rejected during upload processing.
 * HTTP Mapping: 400 Bad Request
 */
export class FileUploadError extends Error {
  constructor(message: string = "No resume file provided") {
    super(message);
    this.name = "FileUploadError";
  }
}

/**
 * Thrown when a request body or uploaded file exceeds the allowed size limit.
 * HTTP Mapping: 413 Payload Too Large
 */
export class PayloadTooLargeError extends Error {
  constructor(message: string = "Payload exceeds size limit") {
    super(message);
    this.name = "PayloadTooLargeError";
  }
}
