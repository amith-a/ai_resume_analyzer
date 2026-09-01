import type pg from "pg";
import { pool } from "../config/db.js";
import { toVectorSql, parseVectorSql } from "../utils/vector.utils.js";
import type {
  DocumentRecord,
  DocumentChunkRecord,
  DocumentChunkWithDistanceRecord,
  CreateDocumentParams,
  CreateChunkParams,
} from "../types/document.types.js";

export type Queryable = pg.Pool | pg.PoolClient;

/**
 * Raw row shape returned by PostgreSQL for document_chunks queries before vector parsing.
 */
interface RawChunkRow {
  id: string;
  document_id: string;
  chunk_index: number;
  content: string;
  metadata: Record<string, unknown>;
  embedding: string | null;
  created_at: Date;
}

/**
 * Raw row shape returned by PostgreSQL when ordering by cosine distance.
 */
interface RawChunkWithDistanceRow extends RawChunkRow {
  distance: string | number;
}

/**
 * Inserts a single document row into the `documents` table.
 *
 * @param params - Document properties to insert.
 * @param queryable - PostgreSQL Pool or PoolClient (defaults to global pool).
 * @returns Promise<DocumentRecord> - Inserted document record.
 */
export async function insertDocument(
  params: CreateDocumentParams,
  queryable: Queryable = pool,
): Promise<DocumentRecord> {
  if (!params.title || typeof params.title !== "string" || params.title.trim().length === 0) {
    throw new TypeError("Document title must be a non-empty string");
  }

  if (
    !params.document_type ||
    typeof params.document_type !== "string" ||
    params.document_type.trim().length === 0
  ) {
    throw new TypeError("Document type must be a non-empty string");
  }

  const query = `
    INSERT INTO documents (title, file_path, document_type, raw_text, metadata)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id, title, file_path, document_type, raw_text, metadata, created_at, updated_at;
  `;

  const values = [
    params.title.trim(),
    params.file_path ?? null,
    params.document_type.trim(),
    params.raw_text ?? null,
    JSON.stringify(params.metadata ?? {}),
  ];

  const result = await queryable.query<DocumentRecord>(query, values);
  return result.rows[0];
}

/**
 * Batch inserts chunk records and their vector embeddings into the `document_chunks` table.
 *
 * @param chunks - Array of chunk records to store.
 * @param queryable - PostgreSQL Pool or PoolClient (defaults to global pool).
 * @returns Promise<DocumentChunkRecord[]> - Array of persisted chunk records with parsed vectors.
 */
export async function insertDocumentChunks(
  chunks: CreateChunkParams[],
  queryable: Queryable = pool,
): Promise<DocumentChunkRecord[]> {
  if (!Array.isArray(chunks) || chunks.length === 0) {
    return [];
  }

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    if (!chunk.document_id || typeof chunk.document_id !== "string") {
      throw new TypeError(`Chunk at index ${i} has invalid document_id`);
    }
    if (typeof chunk.chunk_index !== "number" || chunk.chunk_index < 0) {
      throw new TypeError(`Chunk at index ${i} has invalid chunk_index`);
    }
    if (!chunk.content || typeof chunk.content !== "string" || chunk.content.trim().length === 0) {
      throw new TypeError(`Chunk at index ${i} has empty or invalid content`);
    }
  }

  const valueClauses: string[] = [];
  const queryParams: unknown[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const offset = i * 5;

    valueClauses.push(
      `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}::vector)`,
    );

    const vectorSql = chunk.embedding ? toVectorSql(chunk.embedding) : null;

    queryParams.push(
      chunk.document_id,
      chunk.chunk_index,
      chunk.content.trim(),
      JSON.stringify(chunk.metadata ?? {}),
      vectorSql,
    );
  }

  const query = `
    INSERT INTO document_chunks (document_id, chunk_index, content, metadata, embedding)
    VALUES ${valueClauses.join(", ")}
    RETURNING id, document_id, chunk_index, content, metadata, embedding::text, created_at;
  `;

  const result = await queryable.query<RawChunkRow>(query, queryParams);

  return result.rows.map((row) => ({
    id: row.id,
    document_id: row.document_id,
    chunk_index: row.chunk_index,
    content: row.content,
    metadata: row.metadata,
    embedding: row.embedding ? parseVectorSql(row.embedding) : null,
    created_at: row.created_at,
  }));
}

/**
 * Finds a document by its UUID in the `documents` table.
 *
 * @param id - Document UUID.
 * @param queryable - PostgreSQL Pool or PoolClient (defaults to global pool).
 * @returns Promise<DocumentRecord | null>
 */
export async function findDocumentById(
  id: string,
  queryable: Queryable = pool,
): Promise<DocumentRecord | null> {
  if (!id || typeof id !== "string") {
    return null;
  }

  const query = `
    SELECT id, title, file_path, document_type, raw_text, metadata, created_at, updated_at
    FROM documents
    WHERE id = $1;
  `;

  const result = await queryable.query<DocumentRecord>(query, [id]);
  return result.rows[0] ?? null;
}

/**
 * Finds all chunks for a document ordered by `chunk_index ASC`.
 *
 * @param documentId - Parent document UUID.
 * @param queryable - PostgreSQL Pool or PoolClient (defaults to global pool).
 * @returns Promise<DocumentChunkRecord[]>
 */
export async function findDocumentChunksByDocumentId(
  documentId: string,
  queryable: Queryable = pool,
): Promise<DocumentChunkRecord[]> {
  if (!documentId || typeof documentId !== "string") {
    return [];
  }

  const query = `
    SELECT id, document_id, chunk_index, content, metadata, embedding::text, created_at
    FROM document_chunks
    WHERE document_id = $1
    ORDER BY chunk_index ASC;
  `;

  const result = await queryable.query<RawChunkRow>(query, [documentId]);

  return result.rows.map((row) => ({
    id: row.id,
    document_id: row.document_id,
    chunk_index: row.chunk_index,
    content: row.content,
    metadata: row.metadata,
    embedding: row.embedding ? parseVectorSql(row.embedding) : null,
    created_at: row.created_at,
  }));
}

/**
 * Deletes a document by ID. Relies on PostgreSQL `ON DELETE CASCADE` to delete all associated chunks.
 *
 * @param id - Document UUID.
 * @param queryable - PostgreSQL Pool or PoolClient (defaults to global pool).
 * @returns Promise<boolean> - True if row was deleted, false otherwise.
 */
export async function deleteDocumentById(
  id: string,
  queryable: Queryable = pool,
): Promise<boolean> {
  if (!id || typeof id !== "string") {
    return false;
  }

  const query = `DELETE FROM documents WHERE id = $1;`;
  const result = await queryable.query(query, [id]);
  return (result.rowCount ?? 0) > 0;
}

/**
 * Finds the top-k closest chunks for a document ordered by cosine distance to a query vector,
 * optionally filtered by a maximum acceptable cosine distance threshold and/or metadata filters.
 *
 * @param documentId - Parent document UUID to scope chunks to.
 * @param queryVector - Query embedding vector (e.g., 768 dimensions).
 * @param topK - Maximum number of closest chunks to retrieve (must be a positive integer).
 * @param maxDistanceThreshold - Optional maximum allowable cosine distance (must be a non-negative finite number).
 * @param metadataFilter - Optional key-value metadata filter object.
 * @param queryable - PostgreSQL Pool or PoolClient (defaults to global pool).
 * @returns Promise<DocumentChunkWithDistanceRecord[]> - Matching chunks ordered from closest to farthest (ascending distance).
 */
export async function findChunksByDocumentIdOrderedBySimilarity(
  documentId: string,
  queryVector: number[] | Float32Array,
  topK: number,
  maxDistanceThreshold?: number,
  metadataFilter?: Record<string, unknown>,
  queryable: Queryable = pool,
): Promise<DocumentChunkWithDistanceRecord[]> {
  if (!documentId || typeof documentId !== "string" || documentId.trim().length === 0) {
    throw new TypeError("documentId must be a non-empty string");
  }

  if (typeof topK !== "number" || !Number.isInteger(topK) || topK <= 0) {
    throw new RangeError("topK must be a positive integer");
  }

  if (
    maxDistanceThreshold !== undefined &&
    (typeof maxDistanceThreshold !== "number" ||
      !Number.isFinite(maxDistanceThreshold) ||
      maxDistanceThreshold < 0)
  ) {
    throw new RangeError("maxDistanceThreshold must be a non-negative finite number");
  }

  if (
    metadataFilter !== undefined &&
    (typeof metadataFilter !== "object" || metadataFilter === null || Array.isArray(metadataFilter))
  ) {
    throw new TypeError("metadataFilter must be a valid object");
  }

  // Validate and format vector literal (verifies 768-dimension finite numbers)
  const vectorSql = toVectorSql(queryVector);

  const queryParams: unknown[] = [documentId.trim(), vectorSql, topK];
  const whereClauses: string[] = ["document_id = $1"];

  if (maxDistanceThreshold !== undefined) {
    queryParams.push(maxDistanceThreshold);
    whereClauses.push(`(embedding <=> $2::vector) <= $${queryParams.length}`);
  }

  const hasMetadataFilter = metadataFilter !== undefined && Object.keys(metadataFilter).length > 0;

  if (hasMetadataFilter) {
    queryParams.push(JSON.stringify(metadataFilter));
    whereClauses.push(`metadata @> $${queryParams.length}::jsonb`);
  }

  const query = `
    SELECT id, document_id, chunk_index, content, metadata, embedding::text,
           (embedding <=> $2::vector) AS distance
    FROM document_chunks
    WHERE ${whereClauses.join(" AND ")}
    ORDER BY embedding <=> $2::vector ASC
    LIMIT $3;
  `;

  const result = await queryable.query<RawChunkWithDistanceRow>(query, queryParams);

  return result.rows.map((row) => ({
    id: row.id,
    document_id: row.document_id,
    chunk_index: row.chunk_index,
    content: row.content,
    metadata: row.metadata,
    embedding: row.embedding ? parseVectorSql(row.embedding) : null,
    distance: typeof row.distance === "number" ? row.distance : parseFloat(row.distance),
    created_at: row.created_at,
  }));
}
