import { env } from "../config/env.js";
import type { DocumentChunkWithDistanceRecord } from "../types/document.types.js";

export const DEFAULT_MAX_CONTEXT_CHARACTERS = 4000;

export interface ContextLimitOptions {
  maxCharacters?: number;
}

export interface LimitedContextResult {
  chunks: DocumentChunkWithDistanceRecord[];
  totalCharacters: number;
  isTruncated: boolean;
}

/**
 * Deterministically limits retrieved context chunks according to a character budget.
 *
 * Behavior:
 * - Preserves the most relevant chunks first according to the existing retrieval order.
 * - Prioritizes preserving complete chunks without arbitrary slicing.
 * - If the very first chunk exceeds the limit, deterministically truncates it to fit the budget.
 * - Handles empty context inputs gracefully without throwing.
 *
 * @param chunks - Array of retrieved chunks ordered by relevance.
 * @param options - Optional context configuration overrides.
 * @returns LimitedContextResult - Selected chunks, character total, and truncation indicator.
 */
export function limitContextChunks(
  chunks: DocumentChunkWithDistanceRecord[],
  options?: ContextLimitOptions,
): LimitedContextResult {
  if (!Array.isArray(chunks)) {
    throw new TypeError("Chunks must be an array");
  }

  const maxChars =
    options?.maxCharacters ?? env.RAG_MAX_CONTEXT_CHARACTERS ?? DEFAULT_MAX_CONTEXT_CHARACTERS;

  if (
    typeof maxChars !== "number" ||
    !Number.isFinite(maxChars) ||
    !Number.isInteger(maxChars) ||
    maxChars <= 0
  ) {
    throw new RangeError("maxCharacters must be a positive integer");
  }

  if (chunks.length === 0) {
    return {
      chunks: [],
      totalCharacters: 0,
      isTruncated: false,
    };
  }

  const selectedChunks: DocumentChunkWithDistanceRecord[] = [];
  let currentTotalLength = 0;
  let isTruncated = false;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const chunkContent = chunk.content ?? "";
    const chunkLength = chunkContent.length;

    if (currentTotalLength + chunkLength <= maxChars) {
      selectedChunks.push(chunk);
      currentTotalLength += chunkLength;
    } else {
      if (selectedChunks.length === 0) {
        const truncatedContent = chunkContent.slice(0, maxChars);
        selectedChunks.push({
          ...chunk,
          content: truncatedContent,
        });
        currentTotalLength = truncatedContent.length;
      }
      isTruncated = true;
      break;
    }
  }

  return {
    chunks: selectedChunks,
    totalCharacters: currentTotalLength,
    isTruncated,
  };
}

/**
 * Formats an array of chunk records into a clean concatenated context string.
 *
 * @param chunks - Array of chunk items with content strings.
 * @param separator - Delimiter to join chunks (defaults to '\n\n').
 * @returns Concatenated context text.
 */
export function formatContextString(
  chunks: Array<{ content: string }>,
  separator: string = "\n\n",
): string {
  if (!Array.isArray(chunks) || chunks.length === 0) {
    return "";
  }
  return chunks
    .map((c) => c.content.trim())
    .filter(Boolean)
    .join(separator);
}
