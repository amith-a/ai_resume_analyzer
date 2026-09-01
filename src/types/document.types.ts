import type { ChunkOptions } from "../utils/chunker.util.js";

/**
 * Represents a stored document in the PostgreSQL `documents` table.
 */
export interface DocumentRecord {
  id: string;
  title: string;
  file_path: string | null;
  document_type: string;
  raw_text: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

/**
 * Represents a stored chunk in the PostgreSQL `document_chunks` table.
 */
export interface DocumentChunkRecord {
  id: string;
  document_id: string;
  chunk_index: number;
  content: string;
  metadata: Record<string, unknown>;
  embedding: number[] | null;
  created_at: Date;
}

/**
 * Represents a stored chunk with calculated cosine distance from a query vector.
 */
export interface DocumentChunkWithDistanceRecord extends DocumentChunkRecord {
  distance: number;
}

/**
 * Parameters for creating a document record in `documents` table.
 */
export interface CreateDocumentParams {
  title: string;
  document_type: string;
  file_path?: string | null;
  raw_text?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Parameters for creating an individual chunk record in `document_chunks` table.
 */
export interface CreateChunkParams {
  document_id: string;
  chunk_index: number;
  content: string;
  metadata?: Record<string, unknown>;
  embedding?: number[] | null;
}

/**
 * Parameters for orchestrating the complete document storage pipeline
 * (parent document insertion + chunking + embedding + chunk storage).
 */
export interface StoreDocumentWithChunksParams {
  title: string;
  document_type: string;
  raw_text: string;
  file_path?: string | null;
  metadata?: Record<string, unknown>;
  chunkOptions?: ChunkOptions;
}

/**
 * Result of storing a document along with all its embedded chunks.
 */
export interface StoreDocumentResult {
  document: DocumentRecord;
  chunks: DocumentChunkRecord[];
}

/**
 * Parameters for retrieving relevant chunks for a document given a text query.
 */
export interface RetrieveChunksParams {
  query: string;
  documentId: string;
  topK?: number;
  maxDistanceThreshold?: number;
  metadataFilter?: Record<string, unknown>;
}
