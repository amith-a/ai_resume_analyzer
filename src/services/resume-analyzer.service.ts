import { ChatOllama } from "@langchain/ollama";
import type { Runnable } from "@langchain/core/runnables";
import { env } from "../config/env.js";
import { resumeAnalysisPrompt } from "../ai/prompts/resume-analysis.prompt.js";
import {
  ResumeAnalysis,
  ResumeAnalysisSchema,
} from "../ai/schemas/resume-analysis.schema.js";
import { SchemaValidationError, UpstreamAIError } from "../errors/index.js";

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
    modelOverride ??
    new ChatOllama({
      model: env.OLLAMA_MODEL,
      baseUrl: env.OLLAMA_HOST,
      temperature: 0,
      think: false,
    }).withStructuredOutput(ResumeAnalysisSchema);

  const pipeline = resumeAnalysisPrompt.pipe(structuredModel);

  const start = performance.now();

  try {
    const signal = AbortSignal.timeout(90_000);

    const structuredResult = await pipeline.invoke(
      { resumeText: resumeText.trim() },
      { signal },
    );

    const duration = performance.now() - start;

    console.log(
      `Resume analysis LLM inference completed in ${duration.toFixed(0)}ms`,
    );

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
  } catch (error: unknown) {
    const duration = performance.now() - start;

    if (error instanceof SchemaValidationError) {
      throw error;
    }

    console.error(
      `Resume analysis LLM invocation failed after ${duration.toFixed(0)}ms:`,
      error,
    );

    throw new UpstreamAIError("Resume analysis failed");
  }
}
