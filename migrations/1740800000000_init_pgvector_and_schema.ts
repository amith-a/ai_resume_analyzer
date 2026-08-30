import type { MigrationBuilder, ColumnDefinitions } from "node-pg-migrate";

export const shorthands: ColumnDefinitions | undefined = undefined;

/**
 * Migration: 001_init_pgvector_and_schema
 *
 * Target Embedding Model: nomic-embed-text
 * Target Embedding Dimension: 768
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  // 1. Enable pgvector extension
  pgm.createExtension("vector", { ifNotExists: true });

  // 2. Create documents table
  pgm.createTable("documents", {
    id: {
      type: "uuid",
      primaryKey: true,
      default: pgm.func("gen_random_uuid()"),
    },
    title: {
      type: "text",
      notNull: true,
    },
    file_path: {
      type: "text",
      notNull: false,
    },
    document_type: {
      type: "varchar(50)",
      notNull: true,
    },
    raw_text: {
      type: "text",
      notNull: false,
    },
    metadata: {
      type: "jsonb",
      notNull: true,
      default: "{}",
    },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("NOW()"),
    },
    updated_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("NOW()"),
    },
  });

  // 3. Create document_chunks table with 768-dimension vector
  pgm.createTable("document_chunks", {
    id: {
      type: "uuid",
      primaryKey: true,
      default: pgm.func("gen_random_uuid()"),
    },
    document_id: {
      type: "uuid",
      notNull: true,
      references: "documents",
      onDelete: "CASCADE",
    },
    chunk_index: {
      type: "integer",
      notNull: true,
    },
    content: {
      type: "text",
      notNull: true,
    },
    metadata: {
      type: "jsonb",
      notNull: true,
      default: "{}",
    },
    embedding: {
      type: "vector(768)",
      notNull: false,
    },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("NOW()"),
    },
  });

  // 4. Create foreign key index for efficient relational joins / lookups
  pgm.createIndex("document_chunks", "document_id", {
    name: "idx_document_chunks_document_id",
  });

  // 5. Create HNSW index on vector column using cosine distance operator class
  pgm.sql(
    "CREATE INDEX idx_document_chunks_embedding_hnsw ON document_chunks USING hnsw (embedding vector_cosine_ops);",
  );
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql("DROP INDEX IF EXISTS idx_document_chunks_embedding_hnsw;");
  pgm.dropTable("document_chunks", { ifExists: true, cascade: true });
  pgm.dropTable("documents", { ifExists: true, cascade: true });
  pgm.dropExtension("vector", { ifExists: true });
}
