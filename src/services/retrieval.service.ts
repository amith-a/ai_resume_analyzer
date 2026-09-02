import type pg from "pg";
import { pool } from "../config/db.js";
import { findChunksByDocumentIdOrderedBySimilarity } from "../repositories/document.repository.js";
import type {
  RetrieveChunksParams,
  DocumentChunkWithDistanceRecord,
} from "../types/document.types.js";

export interface RetrievalServiceOptions {
  queryable?: pg.Pool | pg.PoolClient;
  vectorRepository?: {
    findChunksByDocumentIdOrderedBySimilarity: typeof findChunksByDocumentIdOrderedBySimilarity;
  };
}

export async function retrieveChunks(
  params: RetrieveChunksParams,
  options?: RetrievalServiceOptions,
): Promise<DocumentChunkWithDistanceRecord[]> {
  if (!params || typeof params !== "object") {
    throw new TypeError("params must be an object");
  }

  if (
    !params.documentId ||
    typeof params.documentId !== "string" ||
    params.documentId.trim().length === 0
  ) {
    throw new TypeError("Document ID must be a non-empty string");
  }

  if (
    !params.queryVector ||
    (!Array.isArray(params.queryVector) && !(params.queryVector instanceof Float32Array)) ||
    params.queryVector.length === 0
  ) {
    throw new TypeError("Query vector must be a non-empty array of numbers");
  }

  const topK = params.topK ?? 5;
  if (typeof topK !== "number" || !Number.isInteger(topK) || topK <= 0) {
    throw new RangeError("topK must be a positive integer");
  }

  if (params.maxDistanceThreshold !== undefined) {
    if (
      typeof params.maxDistanceThreshold !== "number" ||
      !Number.isFinite(params.maxDistanceThreshold) ||
      params.maxDistanceThreshold < 0
    ) {
      throw new RangeError("maxDistanceThreshold must be a non-negative finite number");
    }
  }

  const repositoryFn =
    options?.vectorRepository?.findChunksByDocumentIdOrderedBySimilarity ??
    findChunksByDocumentIdOrderedBySimilarity;

  const queryable = options?.queryable ?? pool;

  return repositoryFn(
    params.documentId.trim(),
    params.queryVector,
    topK,
    params.maxDistanceThreshold,
    params.metadataFilter,
    queryable,
  );
}
