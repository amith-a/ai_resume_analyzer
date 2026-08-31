import type { Runnable } from "@langchain/core/runnables";
import { env } from "../config/env.js";
import { createStructuredOllamaModel } from "../ai/model-factory.js";
import { resumeAnalysisPrompt } from "../ai/prompts/resume-analysis.prompt.js";
import {
  ResumeAnalysis,
  ResumeAnalysisSchema,
} from "../ai/schemas/resume-analysis.schema.js";
import { SchemaValidationError } from "../errors/index.js";
import { handleLlmError } from "../ai/error-handler.js";

/**
 * Analyzes normalized resume text using the LLM and validates
 * the output strictly against ResumeAnalysisSchema.
 *
 * @param resumeText - The normalized plain text of the resume.
 * @param modelOverride - Optional test seam to inject a mock structured runnable.
 * @returns Promise<ResumeAnalysis> - Type-safe, validated resume analysis object.
 */
export async function analyzeResume(
  resumeText: string,
  modelOverride?: Runnable<any, any>,
): Promise<ResumeAnalysis> {
  if (
    !resumeText ||
    typeof resumeText !== "string" ||
    resumeText.trim().length === 0
  ) {
    throw new TypeError("Resume text must be a non-empty string");
  }

  const structuredModel =
    modelOverride ?? createStructuredOllamaModel(ResumeAnalysisSchema);

  const pipeline = resumeAnalysisPrompt.pipe(structuredModel);

  const start = performance.now();
  let structuredResult: unknown;

  try {
    const signal = AbortSignal.timeout(env.LLM_TIMEOUT_MS);
    structuredResult = await pipeline.invoke(
      { resumeText: resumeText.trim() },
      { signal },
    );
  } catch (error: unknown) {
    const duration = performance.now() - start;
    console.error(
      `Resume analysis LLM invocation failed after ${duration.toFixed(0)}ms:`,
      error,
    );
    handleLlmError(error, ResumeAnalysisSchema);
  }

  const duration = performance.now() - start;
  console.log(
    `Resume analysis LLM inference completed in ${duration.toFixed(0)}ms`,
  );

  // Defensive validation using the canonical schema
  const parseResult = ResumeAnalysisSchema.safeParse(structuredResult);

  if (!parseResult.success) {
    console.error(
      "Resume analysis output failed defensive schema validation:",
      parseResult.error.format(),
    );
    throw new SchemaValidationError(
      "Model output failed defensive schema validation",
      parseResult.error.issues,
    );
  }

  return parseResult.data;
}
