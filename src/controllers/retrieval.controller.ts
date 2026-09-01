import type { Request, Response } from "express";
import { retrievalService } from "../services/retrieval.service.js";

/**
 * Controller: Handles POST /retrieval/chunks - Validates request payload and queries
 * the RetrievalService for matching document chunks.
 */
export async function retrieveChunksHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { query, documentId, topK, maxDistanceThreshold, metadataFilter } = req.body ?? {};

  // 1. Validate query
  if (!query || typeof query !== "string" || query.trim().length === 0) {
    res.status(400).json({
      status: "error",
      message: "Query must be a non-empty string",
    });
    return;
  }

  // 2. Validate documentId
  if (!documentId || typeof documentId !== "string" || documentId.trim().length === 0) {
    res.status(400).json({
      status: "error",
      message: "Document ID must be a non-empty string",
    });
    return;
  }

  // 3. Validate topK (optional)
  if (topK !== undefined) {
    if (typeof topK !== "number" || !Number.isInteger(topK) || topK <= 0) {
      res.status(400).json({
        status: "error",
        message: "topK must be a positive integer",
      });
      return;
    }
  }

  // 4. Validate maxDistanceThreshold (optional)
  if (maxDistanceThreshold !== undefined) {
    if (
      typeof maxDistanceThreshold !== "number" ||
      !Number.isFinite(maxDistanceThreshold) ||
      maxDistanceThreshold < 0
    ) {
      res.status(400).json({
        status: "error",
        message: "maxDistanceThreshold must be a non-negative finite number",
      });
      return;
    }
  }

  // 5. Validate metadataFilter (optional)
  if (metadataFilter !== undefined) {
    if (
      typeof metadataFilter !== "object" ||
      metadataFilter === null ||
      Array.isArray(metadataFilter)
    ) {
      res.status(400).json({
        status: "error",
        message: "metadataFilter must be a valid object",
      });
      return;
    }
  }

  // 6. Invoke Retrieval Service
  const chunks = await retrievalService.retrieveChunks({
    query: query.trim(),
    documentId: documentId.trim(),
    topK,
    maxDistanceThreshold,
    metadataFilter,
  });

  // 7. Format clean response (sanitize out raw embedding vectors or internal details)
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
