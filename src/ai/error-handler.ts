import { z } from "zod";
import { OutputParserException } from "@langchain/core/output_parsers";
import { SchemaValidationError, UpstreamAIError } from "../errors/index.js";

/**
 * Handles errors during LLM pipeline invocation.
 * Maps schema/parser failures to SchemaValidationError (HTTP 422)
 * and upstream network/server failures to UpstreamAIError (HTTP 502).
 */
export function handleLlmError(error: unknown, schema: z.ZodType): never {
  if (error instanceof z.ZodError) {
    throw new SchemaValidationError(
      "Model output failed defensive schema validation",
      error.issues,
    );
  }

  if (
    error instanceof OutputParserException ||
    (error instanceof Error && error.name === "OutputParserException")
  ) {
    let issues: z.core.$ZodIssue[] = [];
    const rawOutput =
      typeof error === "object" && error !== null && "llmOutput" in error
        ? (error as { llmOutput?: unknown }).llmOutput
        : undefined;

    if (typeof rawOutput === "string") {
      try {
        const parsedJson = JSON.parse(rawOutput);
        const parseResult = schema.safeParse(parsedJson);
        if (!parseResult.success) {
          issues = parseResult.error.issues;
        }
      } catch {
        // Output was malformed JSON string, issues list remains empty
      }
    }

    throw new SchemaValidationError("Model output failed defensive schema validation", issues);
  }

  throw new UpstreamAIError("Upstream LLM invocation failed or timed out", error);
}
