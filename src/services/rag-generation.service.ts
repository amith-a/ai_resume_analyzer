import type { Runnable } from "@langchain/core/runnables";
import type { BaseLanguageModelInput } from "@langchain/core/language_models/base";
import { env } from "../config/env.js";
import { createStructuredOllamaModel } from "../ai/model-factory.js";
import { ragPrompt } from "../ai/prompts/rag.prompt.js";
import { RagAnswerSchema, type RagAnswer } from "../ai/schemas/rag-answer.schema.js";
import { z } from "zod";
import { OutputParserException } from "@langchain/core/output_parsers";
import { UpstreamAIError, SchemaValidationError } from "../errors/index.js";
import { handleLlmError } from "../ai/error-handler.js";
import { logger, getRequestId } from "../config/logger.js";

export interface GenerateRagAnswerParams {
  query: string;
  context?: string;
}

export interface RagGenerationOptions {
  modelOverride?: Runnable<BaseLanguageModelInput, RagAnswer | unknown>;
  timeoutMsOverride?: number;
}

export interface RagGenerationResult {
  answer: string;
}

/**
 * Strips model thinking/reasoning blocks enclosed in <think>...</think> tags defensively.
 */
export function removeThinkingTags(text: string): string {
  if (!text) {
    return "";
  }
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

/**
 * Generates a structured answer from retrieved context and user query using the RAG prompt and structured chat model.
 *
 * @param params - Query and optional formatted context.
 * @param options - Optional model override or timeout override for testing.
 * @returns Promise<RagGenerationResult> - Clean user-facing answer text.
 */
export async function generateRagAnswer(
  params: GenerateRagAnswerParams,
  options?: RagGenerationOptions,
): Promise<RagGenerationResult> {
  if (!params || typeof params !== "object") {
    throw new TypeError("params must be an object");
  }

  if (typeof params.query !== "string" || params.query.trim().length === 0) {
    throw new TypeError("Query must be a non-empty string");
  }

  const query = params.query.trim();
  const context = typeof params.context === "string" ? params.context.trim() : "";

  const model = options?.modelOverride ?? createStructuredOllamaModel(RagAnswerSchema);
  const pipeline = ragPrompt.pipe(model);

  const timeoutMs = options?.timeoutMsOverride ?? env.LLM_TIMEOUT_MS;
  const start = performance.now();

  let response: unknown;
  try {
    const signal = AbortSignal.timeout(timeoutMs);
    response = await pipeline.invoke({ query, context }, { signal });
  } catch (error: unknown) {
    const duration = performance.now() - start;
    const errorType = error instanceof Error ? error.name : "Error";
    const requestId = getRequestId();
    logger.error(
      {
        operation: "ai_rag_answer",
        status: "error",
        model: env.OLLAMA_MODEL,
        durationMs: Math.round(duration),
        errorType,
        ...(requestId ? { requestId } : {}),
      },
      `RAG answer generation failed after ${duration.toFixed(0)}ms (${errorType})`,
    );

    if (error instanceof TypeError || error instanceof SchemaValidationError) {
      throw error;
    }

    if (
      error instanceof OutputParserException ||
      (error instanceof Error && error.name === "OutputParserException") ||
      error instanceof z.ZodError
    ) {
      handleLlmError(error, RagAnswerSchema);
    }

    throw new UpstreamAIError("RAG answer generation failed or timed out", error);
  }

  const duration = performance.now() - start;
  const requestId = getRequestId();
  logger.info(
    {
      operation: "ai_rag_answer",
      status: "success",
      model: env.OLLAMA_MODEL,
      durationMs: Math.round(duration),
      ...(requestId ? { requestId } : {}),
    },
    `RAG answer generation completed in ${duration.toFixed(0)}ms`,
  );

  const parseResult = RagAnswerSchema.safeParse(response);
  if (!parseResult.success) {
    logger.error(
      {
        operation: "ai_rag_answer",
        status: "error",
        errorType: "SchemaValidationError",
        issueCount: parseResult.error.issues.length,
        ...(requestId ? { requestId } : {}),
      },
      `RAG answer output failed defensive schema validation (${parseResult.error.issues.length} issues)`,
    );
    throw new SchemaValidationError(
      "Model output failed defensive schema validation",
      parseResult.error.issues,
    );
  }

  const cleanAnswer = removeThinkingTags(parseResult.data.answer);

  return {
    answer: cleanAnswer,
  };
}
