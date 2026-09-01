import type pg from "pg";
import { pool } from "../config/db.js";
import { embedText, type EmbeddingsClient } from "./embedding.service.js";
import { findChunksByDocumentIdOrderedBySimilarity } from "../repositories/document.repository.js";
import type {
  RetrieveChunksParams,
  DocumentChunkWithDistanceRecord,
} from "../types/document.types.js";

/**
 * Dependencies and options for retrieval service testability and custom injection.
 */
export interface RetrievalServiceOptions {
  embeddingsClient?: EmbeddingsClient;
  queryable?: pg.Pool | pg.PoolClient;
  vectorRepository?: {
    findChunksByDocumentIdOrderedBySimilarity: typeof findChunksByDocumentIdOrderedBySimilarity;
  };
}

/**
 * Service Orchestration: Coordinates embedding generation and vector retrieval.
 *
 * Flow:
 * query
 *   ↓
 * EmbeddingService (embedText)
 *   ↓
 * query vector
 *   ↓
 * VectorRepository (findChunksByDocumentIdOrderedBySimilarity)
 *   ↓
 * PostgreSQL + pgvector
 *   ↓
 * retrieved chunks
 *
 * @param params - Query text, document ID, and optional search options (topK, maxDistanceThreshold, metadataFilter).
 * @param options - Optional dependency injection overrides for testing.
 * @returns Promise<DocumentChunkWithDistanceRecord[]> - Matching chunks ordered from closest to farthest.
 */
export async function retrieveChunks(
  params: RetrieveChunksParams,
  options?: RetrievalServiceOptions,
): Promise<DocumentChunkWithDistanceRecord[]> {
  if (!params || typeof params !== "object") {
    throw new TypeError("params must be an object");
  }

  if (!params.query || typeof params.query !== "string" || params.query.trim().length === 0) {
    throw new TypeError("Query must be a non-empty string");
  }

  if (
    !params.documentId ||
    typeof params.documentId !== "string" ||
    params.documentId.trim().length === 0
  ) {
    throw new TypeError("Document ID must be a non-empty string");
  }

  const topK = params.topK ?? 5;
  if (typeof topK !== "number" || !Number.isInteger(topK) || topK <= 0) {
    throw new RangeError("topK must be a positive integer");
  }

  // 1. Generate query embedding vector using EmbeddingService
  const queryVector = await embedText(params.query, options?.embeddingsClient);

  // 2. Query Vector Repository with generated vector and filter parameters
  const repositoryFn =
    options?.vectorRepository?.findChunksByDocumentIdOrderedBySimilarity ??
    findChunksByDocumentIdOrderedBySimilarity;

  const queryable = options?.queryable ?? pool;

  const chunks = await repositoryFn(
    params.documentId.trim(),
    queryVector,
    topK,
    params.maxDistanceThreshold,
    params.metadataFilter,
    queryable,
  );

  return chunks;
}

export const retrievalService = {
  retrieveChunks,
};
