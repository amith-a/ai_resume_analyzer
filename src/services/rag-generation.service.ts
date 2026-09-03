import type { Runnable } from "@langchain/core/runnables";
import type { BaseLanguageModelInput } from "@langchain/core/language_models/base";
import { env } from "../config/env.js";
import { createStructuredOllamaModel } from "../ai/model-factory.js";
import { ragPrompt } from "../ai/prompts/rag.prompt.js";
import { RagAnswerSchema, type RagAnswer } from "../ai/schemas/rag-answer.schema.js";
import { UpstreamAIError, SchemaValidationError } from "../errors/index.js";

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
 * Extracts answer text from the structured RagAnswer object.
 */
function extractAnswerText(response: unknown): string {
  if (response && typeof response === "object" && "answer" in response) {
    const rawAnswer = (response as { answer: unknown }).answer;
    return typeof rawAnswer === "string" ? rawAnswer : String(rawAnswer ?? "");
  }
  return "";
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

  try {
    const signal = AbortSignal.timeout(timeoutMs);
    const response = await pipeline.invoke({ query, context }, { signal });

    const duration = performance.now() - start;
    console.log(`RAG answer generation completed in ${duration.toFixed(0)}ms`);

    const rawText = extractAnswerText(response);
    const cleanAnswer = removeThinkingTags(rawText);

    return {
      answer: cleanAnswer,
    };
  } catch (error: unknown) {
    const duration = performance.now() - start;
    console.error(`RAG answer generation failed after ${duration.toFixed(0)}ms:`, error);

    if (error instanceof TypeError || error instanceof SchemaValidationError) {
      throw error;
    }

    throw new UpstreamAIError("RAG answer generation failed or timed out", error);
  }
}
