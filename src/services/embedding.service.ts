import { env } from "../config/env.js";
import { createOllamaEmbeddings } from "../ai/model-factory.js";
import { UpstreamAIError } from "../errors/index.js";

/**
 * Interface representing an embeddings client compatible with LangChain Embeddings.
 */
export interface EmbeddingsClient {
  embedQuery(text: string): Promise<number[]>;
  embedDocuments?(texts: string[]): Promise<number[][]>;
}

/**
 * Executes an async operation with a bounded timeout.
 */
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operationName: string,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${operationName} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Validates that an embedding output is a non-empty array of finite numbers.
 */
function validateEmbeddingVector(vector: unknown): number[] {
  if (!Array.isArray(vector) || vector.length === 0) {
    throw new Error("Embedding model returned empty or non-array vector");
  }

  for (let i = 0; i < vector.length; i++) {
    const val = vector[i];
    if (typeof val !== "number" || !Number.isFinite(val)) {
      throw new Error(`Embedding vector contains invalid number at index ${i}`);
    }
  }

  return vector as number[];
}

/**
 * Generates an embedding vector for a single piece of text (e.g., query or text chunk).
 *
 * @param text - The text string to embed.
 * @param clientOverride - Optional embeddings client test seam.
 * @param timeoutMsOverride - Optional timeout override in milliseconds (defaults to env.EMBEDDING_TIMEOUT_MS).
 * @returns Promise<number[]> - The embedding vector.
 */
export async function embedText(
  text: string,
  clientOverride?: EmbeddingsClient,
  timeoutMsOverride?: number,
): Promise<number[]> {
  if (!text || typeof text !== "string" || text.trim().length === 0) {
    throw new TypeError("Input text must be a non-empty string");
  }

  const client = clientOverride ?? createOllamaEmbeddings();
  const timeoutMs = timeoutMsOverride ?? env.EMBEDDING_TIMEOUT_MS;
  const trimmed = text.trim();

  const start = performance.now();
  try {
    const vectorPromise = client.embedQuery(trimmed);
    const vector = await withTimeout(
      vectorPromise,
      timeoutMs,
      "Embedding generation",
    );
    const validated = validateEmbeddingVector(vector);

    const duration = performance.now() - start;
    console.log(
      `Text embedding generated successfully (dim: ${validated.length}) in ${duration.toFixed(0)}ms`,
    );

    return validated;
  } catch (error: unknown) {
    const duration = performance.now() - start;
    console.error(
      `Embedding generation failed after ${duration.toFixed(0)}ms:`,
      error,
    );

    if (error instanceof TypeError) {
      throw error;
    }

    throw new UpstreamAIError(
      "Failed to generate text embedding from upstream model",
      error,
    );
  }
}

/**
 * Generates embedding vectors for multiple text chunks.
 *
 * @param texts - Array of non-empty text strings to embed.
 * @param clientOverride - Optional embeddings client test seam.
 * @param timeoutMsOverride - Optional timeout override in milliseconds (defaults to env.EMBEDDING_TIMEOUT_MS).
 * @returns Promise<number[][]> - Array of embedding vectors matching input order.
 */
export async function embedChunks(
  texts: string[],
  clientOverride?: EmbeddingsClient,
  timeoutMsOverride?: number,
): Promise<number[][]> {
  if (!Array.isArray(texts) || texts.length === 0) {
    throw new TypeError("Input texts must be a non-empty array of strings");
  }

  for (let i = 0; i < texts.length; i++) {
    const item = texts[i];
    if (!item || typeof item !== "string" || item.trim().length === 0) {
      throw new TypeError(`Input text at index ${i} must be a non-empty string`);
    }
  }

  const client = clientOverride ?? createOllamaEmbeddings();
  const timeoutMs = timeoutMsOverride ?? env.EMBEDDING_TIMEOUT_MS;
  const trimmedTexts = texts.map((t) => t.trim());

  const start = performance.now();
  try {
    let vectorsPromise: Promise<number[][]>;

    if (typeof client.embedDocuments === "function") {
      vectorsPromise = client.embedDocuments(trimmedTexts);
    } else {
      vectorsPromise = Promise.all(
        trimmedTexts.map((text) => client.embedQuery(text)),
      );
    }

    const vectors = await withTimeout(
      vectorsPromise,
      timeoutMs,
      "Batch embedding generation",
    );

    if (!Array.isArray(vectors) || vectors.length !== texts.length) {
      throw new Error(
        `Expected ${texts.length} embedding vectors but received ${vectors?.length ?? 0}`,
      );
    }

    const validatedVectors = vectors.map((v) => validateEmbeddingVector(v));

    const duration = performance.now() - start;
    console.log(
      `Batch embedded ${validatedVectors.length} chunks in ${duration.toFixed(0)}ms`,
    );

    return validatedVectors;
  } catch (error: unknown) {
    const duration = performance.now() - start;
    console.error(
      `Batch embedding failed after ${duration.toFixed(0)}ms:`,
      error,
    );

    if (error instanceof TypeError) {
      throw error;
    }

    throw new UpstreamAIError(
      "Failed to generate batch text embeddings from upstream model",
      error,
    );
  }
}
