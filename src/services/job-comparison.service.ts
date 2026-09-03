import type { Runnable } from "@langchain/core/runnables";
import { z } from "zod";
import { env } from "../config/env.js";
import { createStructuredOllamaModel } from "../ai/model-factory.js";
import { jobComparisonPrompt } from "../ai/prompts/job-comparison.prompt.js";
import {
  JobComparisonInputSchema,
  JobComparisonOutput,
  JobComparisonOutputSchema,
} from "../ai/schemas/job-comparison.schema.js";
import { findDocumentById } from "../repositories/document.repository.js";
import { orchestrateRagRetrieval } from "./rag-retrieval.service.js";
import { limitContextChunks } from "../utils/context-limiter.util.js";
import { constructContext } from "../utils/context-builder.util.js";
import {
  DocumentNotFoundError,
  DocumentExtractionError,
  SchemaValidationError,
} from "../errors/index.js";
import { handleLlmError } from "../ai/error-handler.js";

export interface CompareStoredJobOptions {
  modelOverride?: Runnable<unknown, unknown>;
  documentFinder?: typeof findDocumentById;
  retrievalOrchestrator?: typeof orchestrateRagRetrieval;
  topK?: number;
}

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
  modelOverride?: Runnable<unknown, unknown>,
): Promise<JobComparisonOutput> {
  const inputValidation = JobComparisonInputSchema.safeParse({
    resumeText,
    jobDescription,
  });

  if (!inputValidation.success) {
    throw new TypeError("Resume text and job description must be non-empty strings");
  }

  const { resumeText: cleanResumeText, jobDescription: cleanJobDescription } = inputValidation.data;

  const structuredModel = modelOverride ?? createStructuredOllamaModel(JobComparisonOutputSchema);

  const pipeline = jobComparisonPrompt.pipe(structuredModel);

  const start = performance.now();
  let structuredResult: unknown;

  try {
    const signal = AbortSignal.timeout(env.LLM_TIMEOUT_MS);
    structuredResult = await pipeline.invoke(
      {
        resumeText: cleanResumeText,
        jobDescription: cleanJobDescription,
      },
      { signal },
    );
  } catch (error: unknown) {
    const duration = performance.now() - start;
    console.error(`Job comparison LLM invocation failed after ${duration.toFixed(0)}ms:`, error);
    handleLlmError(error, JobComparisonOutputSchema);
  }

  const duration = performance.now() - start;
  console.log(`Job comparison LLM inference completed in ${duration.toFixed(0)}ms`);

  // Defensive validation using the canonical schema
  const parseResult = JobComparisonOutputSchema.safeParse(structuredResult);

  if (!parseResult.success) {
    console.error(
      "Job comparison output failed defensive schema validation:",
      z.treeifyError(parseResult.error),
    );
    throw new SchemaValidationError(
      "Model output failed defensive schema validation",
      parseResult.error.issues,
    );
  }

  return parseResult.data;
}

/**
 * Compares an already-indexed resume document against a target job description.
 * Retrieves stored resume raw_text from database and calls compareJobDescription.
 *
 * @param documentId - The UUID/identifier of the indexed document.
 * @param jobDescription - The job description text to compare against.
 * @param options - Optional configuration (modelOverride, documentFinder test seam).
 * @returns Promise<JobComparisonOutput> - Type-safe, validated job comparison result.
 */
export async function compareStoredJob(
  documentId: string,
  jobDescription: string,
  options?: CompareStoredJobOptions,
): Promise<JobComparisonOutput> {
  if (!documentId || typeof documentId !== "string" || documentId.trim().length === 0) {
    throw new TypeError("Document ID must be a non-empty string");
  }

  if (!jobDescription || typeof jobDescription !== "string" || jobDescription.trim().length === 0) {
    throw new TypeError("Job description must be a non-empty string");
  }

  const finder = options?.documentFinder ?? findDocumentById;
  const document = await finder(documentId.trim());

  if (!document) {
    throw new DocumentNotFoundError(`Document with ID "${documentId}" not found`);
  }

  if (
    !document.raw_text ||
    typeof document.raw_text !== "string" ||
    document.raw_text.trim().length === 0
  ) {
    throw new DocumentExtractionError(
      `Document with ID "${documentId}" has no extracted text to compare`,
    );
  }

  // Retrieve relevant resume evidence chunks using jobDescription as semantic query
  const cleanJobDescription = jobDescription.trim();
  const orchestrator = options?.retrievalOrchestrator ?? orchestrateRagRetrieval;
  let evidenceText = document.raw_text;

  const retrievedChunks = await orchestrator({
    documentId: document.id,
    query: cleanJobDescription,
    topK: options?.topK ?? 8,
  });

  if (retrievedChunks && retrievedChunks.length > 0) {
    const limitedResult = limitContextChunks(retrievedChunks);
    const builtContext = constructContext(limitedResult.chunks);
    if (builtContext.length > 0) {
      evidenceText = builtContext;
    }
  }

  return compareJobDescription(evidenceText, cleanJobDescription, options?.modelOverride);
}
