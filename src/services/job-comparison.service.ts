import { ChatOllama } from "@langchain/ollama";
import type { Runnable } from "@langchain/core/runnables";
import { env } from "../config/env.js";
import { jobComparisonPrompt } from "../ai/prompts/job-comparison.prompt.js";
import {
  JobComparisonInputSchema,
  JobComparisonOutput,
  JobComparisonOutputSchema,
} from "../ai/schemas/job-comparison.schema.js";
import { SchemaValidationError, UpstreamAIError } from "../errors/index.js";

/**
 * Compares candidate resume text against a target job description and validates
 * the output strictly against JobComparisonOutputSchema.
 *
 * @param resumeText - The normalized plain text of the candidate's resume.
 * @param jobDescription - The plain text of the job description.
 * @param modelOverride - Optional test seam to inject a mock structured runnable.
 * @returns Promise<JobComparisonOutput> - Type-safe, validated job comparison analysis.
 */
export async function compareJobDescription(
  resumeText: string,
  jobDescription: string,
  modelOverride?: Runnable<any, any>
): Promise<JobComparisonOutput> {
  const inputValidation = JobComparisonInputSchema.safeParse({
    resumeText,
    jobDescription,
  });

  if (!inputValidation.success) {
    throw new TypeError(
      "Resume text and job description must be non-empty strings"
    );
  }

  const { resumeText: cleanResumeText, jobDescription: cleanJobDescription } =
    inputValidation.data;

  const structuredModel =
    modelOverride ??
    new ChatOllama({
      model: env.OLLAMA_MODEL,
      baseUrl: env.OLLAMA_HOST,
      temperature: 0,
      think: false,
    }).withStructuredOutput(JobComparisonOutputSchema);

  const pipeline = jobComparisonPrompt.pipe(structuredModel);

  const start = performance.now();
  let structuredResult: unknown;

  try {
    const signal = AbortSignal.timeout(180_000);
    structuredResult = await pipeline.invoke(
      {
        resumeText: cleanResumeText,
        jobDescription: cleanJobDescription,
      },
      { signal }
    );
  } catch (error: unknown) {
    const duration = performance.now() - start;
    console.error(
      `Job comparison LLM invocation failed after ${duration.toFixed(0)}ms:`,
      error
    );
    throw new UpstreamAIError(
      "Upstream LLM invocation failed or timed out",
      error
    );
  }

  const duration = performance.now() - start;
  console.log(
    `Job comparison LLM inference completed in ${duration.toFixed(0)}ms`
  );

  // Defensive validation using the canonical schema
  const parseResult = JobComparisonOutputSchema.safeParse(structuredResult);

  if (!parseResult.success) {
    console.error(
      "Job comparison output failed defensive schema validation:",
      parseResult.error.format()
    );
    throw new SchemaValidationError(
      "Model output failed defensive schema validation",
      parseResult.error.issues
    );
  }

  return parseResult.data;
}
