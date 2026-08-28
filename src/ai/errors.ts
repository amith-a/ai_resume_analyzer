import { z } from "zod";

export class SchemaValidationError extends Error {
  public readonly issues: z.core.$ZodIssue[];

  constructor(message: string, issues: z.core.$ZodIssue[]) {
    super(message);
    this.name = "SchemaValidationError";
    this.issues = issues;
  }
}

export class UpstreamAIError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "UpstreamAIError";
    if (cause) {
      this.cause = cause;
    }
  }
}
