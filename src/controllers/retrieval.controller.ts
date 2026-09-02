import type { Request, Response } from "express";
import { embedText } from "../services/embedding.service.js";
import { retrievalService } from "../services/retrieval.service.js";
import type { RetrieveChunksRequestInput } from "../schemas/retrieval-request.schema.js";

export async function retrieveChunksHandler(
  req: Request<unknown, unknown, RetrieveChunksRequestInput>,
  res: Response,
): Promise<void> {
  const { query, documentId, topK, maxDistanceThreshold, metadataFilter } = req.body;

  const queryVector = await embedText(query);

  const chunks = await retrievalService.retrieveChunks({
    documentId,
    queryVector,
    topK,
    maxDistanceThreshold,
    metadataFilter,
  });

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
