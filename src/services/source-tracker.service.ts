import type { DocumentChunkRecord } from "../types/document.types.js";

export interface RagSource {
  id: string;
  chunkId: string;
  documentId: string;
  chunkIndex: number;
  content: string;
}

export interface GroundedAnswerWithSources {
  answer: string;
  sources: RagSource[];
}

export interface TrackSourcesParams {
  answer: string;
  chunks: DocumentChunkRecord[];
}

/**
 * Associates a grounded answer with the actual retrieved and limited context chunks
 * that were supplied to the LLM during generation.
 *
 * Source-Tracking Rules:
 * 1. Uses the provided chunks as the sole source of truth (never trusts LLM citation markers).
 * 2. Preserves the exact relevance order of the supplied context chunks.
 * 3. Includes only chunks that were passed in (i.e. those selected by the context limiter).
 * 4. Empty chunks array returns `sources: []`.
 *
 * @param params - The grounded answer and the array of context chunks provided to generation.
 * @returns GroundedAnswerWithSources - Answer paired with mapped source references.
 */
export function trackSources(params: TrackSourcesParams): GroundedAnswerWithSources {
  if (!params || typeof params !== "object") {
    throw new TypeError("params must be an object");
  }

  if (typeof params.answer !== "string") {
    throw new TypeError("answer must be a string");
  }

  if (!Array.isArray(params.chunks)) {
    throw new TypeError("chunks must be an array");
  }

  const sources: RagSource[] = params.chunks.map((chunk) => {
    if (
      !chunk ||
      typeof chunk !== "object" ||
      typeof chunk.id !== "string" ||
      typeof chunk.document_id !== "string" ||
      typeof chunk.chunk_index !== "number" ||
      typeof chunk.content !== "string"
    ) {
      throw new TypeError("Each chunk must be a valid chunk record");
    }

    return {
      id: chunk.id,
      chunkId: chunk.id,
      documentId: chunk.document_id,
      chunkIndex: chunk.chunk_index,
      content: chunk.content,
    };
  });

  return {
    answer: params.answer.trim(),
    sources,
  };
}
