import { embedText, type EmbeddingsClient } from "./embedding.service.js";
import { retrieveChunks } from "./retrieval.service.js";
import type { DocumentChunkWithDistanceRecord } from "../types/document.types.js";

export interface RagRetrievalParams {
  query: string;
  documentId: string;
  topK?: number;
  maxDistanceThreshold?: number;
  metadataFilter?: Record<string, unknown>;
}

export interface RagRetrievalServiceOptions {
  embeddingsClient?: EmbeddingsClient;
  retrieveChunks?: typeof retrieveChunks;
}

export async function orchestrateRagRetrieval(
  params: RagRetrievalParams,
  options?: RagRetrievalServiceOptions,
): Promise<DocumentChunkWithDistanceRecord[]> {
  if (!params || typeof params !== "object") {
    throw new TypeError("params must be an object");
  }

  if (typeof params.documentId !== "string" || params.documentId.trim().length === 0) {
    throw new TypeError("Document ID must be a non-empty string");
  }

  const queryVector = await embedText(params.query, options?.embeddingsClient);
  const retrieveFn = options?.retrieveChunks ?? retrieveChunks;

  return retrieveFn({
    documentId: params.documentId,
    queryVector,
    topK: params.topK,
    maxDistanceThreshold: params.maxDistanceThreshold,
    metadataFilter: params.metadataFilter,
  });
}
