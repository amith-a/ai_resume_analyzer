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
  CreateDocumentParams,
  CreateChunkParams,
  StoreDocumentWithChunksParams,
  StoreDocumentResult,
} from "../types/document.types.js";

export async function getDocumentById(
  id: string,
  queryable: pg.Pool | pg.PoolClient = pool,
): Promise<DocumentRecord | null> {
  return findDocumentById(id, queryable);
}

export async function getDocumentChunks(
  documentId: string,
  queryable: pg.Pool | pg.PoolClient = pool,
): Promise<DocumentChunkRecord[]> {
  return findDocumentChunksByDocumentId(documentId, queryable);
}

export async function deleteDocument(
  id: string,
  queryable: pg.Pool | pg.PoolClient = pool,
): Promise<boolean> {
  return deleteDocumentById(id, queryable);
}

export async function saveDocumentWithChunks(
  docParams: CreateDocumentParams,
  chunkContents: Array<{ chunkIndex: number; content: string; embedding: number[] | null }>,
  activePool: pg.Pool = pool,
): Promise<StoreDocumentResult> {
  const client = await activePool.connect();

  try {
    await client.query("BEGIN;");

    const document = await insertDocument(docParams, client);

    const chunkParams: CreateChunkParams[] = chunkContents.map((c) => ({
      document_id: document.id,
      chunk_index: c.chunkIndex,
      content: c.content,
      metadata: {
        ...(docParams.metadata ?? {}),
        chunk_index: c.chunkIndex,
      },
      embedding: c.embedding,
    }));

    const storedChunks = await insertDocumentChunks(chunkParams, client);

    await client.query("COMMIT;");

    return {
      document,
      chunks: storedChunks,
    };
  } catch (error) {
    await client.query("ROLLBACK;").catch((rollbackErr) => {
      console.error("Failed to rollback transaction in saveDocumentWithChunks:", rollbackErr);
    });
    throw error;
  } finally {
    client.release();
  }
}

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

  const chunks = chunkText(params.raw_text, params.chunkOptions);
  if (chunks.length === 0) {
    throw new Error("Text chunking produced zero chunks from input text");
  }

  const chunkTexts = chunks.map((c) => c.content);
  const embeddings = await embedChunks(chunkTexts, options?.embeddingsClient);

  const chunkContents = chunks.map((c, index) => ({
    chunkIndex: c.chunkIndex,
    content: c.content,
    embedding: embeddings[index],
  }));

  return saveDocumentWithChunks(
    {
      title: params.title,
      document_type: params.document_type,
      file_path: params.file_path,
      raw_text: params.raw_text,
      metadata: params.metadata,
    },
    chunkContents,
    options?.pool ?? pool,
  );
}
