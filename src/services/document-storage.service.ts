import type pg from "pg";
import { pool } from "../config/db.js";
import { chunkText } from "../utils/chunker.util.js";
import { embedChunks, type EmbeddingsClient } from "./embedding.service.js";
import {
  insertDocument,
  insertDocumentChunks,
  findDocumentById,
  findDocumentChunksByDocumentId,
  deleteDocumentById,
} from "../repositories/document.repository.js";
import type {
  DocumentRecord,
  DocumentChunkRecord,
  CreateChunkParams,
  StoreDocumentWithChunksParams,
  StoreDocumentResult,
} from "../types/document.types.js";

/**
 * Service: Retrieves a single document by UUID from repository.
 */
export async function getDocumentById(
  id: string,
  queryable: pg.Pool | pg.PoolClient = pool,
): Promise<DocumentRecord | null> {
  return findDocumentById(id, queryable);
}

/**
 * Service: Retrieves all chunks for a given document from repository.
 */
export async function getDocumentChunks(
  documentId: string,
  queryable: pg.Pool | pg.PoolClient = pool,
): Promise<DocumentChunkRecord[]> {
  return findDocumentChunksByDocumentId(documentId, queryable);
}

/**
 * Service: Deletes a document by ID via repository.
 */
export async function deleteDocument(
  id: string,
  queryable: pg.Pool | pg.PoolClient = pool,
): Promise<boolean> {
  return deleteDocumentById(id, queryable);
}

/**
 * Service Orchestration: End-to-end pipeline to chunk, embed, and store a document with vectors.
 *
 * 1. Validates text input.
 * 2. Chunks the text using `chunkText()`.
 * 3. Generates 768-dim vector embeddings for all chunks via `embedChunks()`.
 * 4. Executes an atomic PostgreSQL transaction using `insertDocument()` and `insertDocumentChunks()`.
 *
 * @param params - Document content and metadata parameters.
 * @param options - Optional custom embeddings client test seam or custom database pool.
 * @returns Promise<StoreDocumentResult> - Combined document and chunks result.
 */
export async function storeDocumentWithChunks(
  params: StoreDocumentWithChunksParams,
  options?: {
    embeddingsClient?: EmbeddingsClient;
    pool?: pg.Pool;
  },
): Promise<StoreDocumentResult> {
  if (
    !params.raw_text ||
    typeof params.raw_text !== "string" ||
    params.raw_text.trim().length === 0
  ) {
    throw new TypeError("Raw text must be a non-empty string");
  }

  // 1. Split text into chunks
  const chunks = chunkText(params.raw_text, params.chunkOptions);
  if (chunks.length === 0) {
    throw new Error("Text chunking produced zero chunks from input text");
  }

  // 2. Generate embeddings for all chunks in batch
  const chunkTexts = chunks.map((c) => c.content);
  const embeddings = await embedChunks(chunkTexts, options?.embeddingsClient);

  // 3. Connect to database and execute transaction through repository
  const activePool = options?.pool ?? pool;
  const client = await activePool.connect();

  try {
    await client.query("BEGIN;");

    // Insert parent document
    const document = await insertDocument(
      {
        title: params.title,
        document_type: params.document_type,
        file_path: params.file_path,
        raw_text: params.raw_text,
        metadata: params.metadata,
      },
      client,
    );

    // Prepare chunk parameters with embeddings
    const chunkParams: CreateChunkParams[] = chunks.map((c, index) => ({
      document_id: document.id,
      chunk_index: c.chunkIndex,
      content: c.content,
      metadata: {
        ...(params.metadata ?? {}),
        chunk_index: c.chunkIndex,
      },
      embedding: embeddings[index],
    }));

    // Insert chunks via repository
    const storedChunks = await insertDocumentChunks(chunkParams, client);

    await client.query("COMMIT;");

    return {
      document,
      chunks: storedChunks,
    };
  } catch (error) {
    await client.query("ROLLBACK;").catch((rollbackErr) => {
      console.error("Failed to rollback transaction in storeDocumentWithChunks:", rollbackErr);
    });
    throw error;
  } finally {
    client.release();
  }
}
