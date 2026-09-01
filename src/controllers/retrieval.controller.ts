import type { Request, Response } from "express";
import { retrievalService } from "../services/retrieval.service.js";
import type { RetrieveChunksRequestInput } from "../schemas/retrieval-request.schema.js";

/**
 * Controller: Handles POST /retrieval/chunks - Queries the RetrievalService for matching document chunks.
 * Note: Request body validation is handled upstream by `validateBody(RetrieveChunksRequestSchema)`.
 */
export async function retrieveChunksHandler(
  req: Request<unknown, unknown, RetrieveChunksRequestInput>,
  res: Response,
): Promise<void> {
  const { query, documentId, topK, maxDistanceThreshold, metadataFilter } = req.body;

  // Invoke Retrieval Service
  const chunks = await retrievalService.retrieveChunks({
    query,
    documentId,
    topK,
    maxDistanceThreshold,
    metadataFilter,
  });

  // Format clean response (sanitize out raw embedding vectors or internal details)
  const formattedChunks = chunks.map((c) => ({
    id: c.id,
    document_id: c.document_id,
    chunk_index: c.chunk_index,
    content: c.content,
    metadata: c.metadata,
    distance: c.distance,
  }));

  res.status(200).json({
    chunks: formattedChunks,
  });
}
