import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import pg from "pg";
import { env } from "../src/config/env.js";
import { toVectorSql, DEFAULT_VECTOR_DIMENSION } from "../src/utils/vector.utils.js";

const { Pool } = pg;

// Helper to create deterministic normalized unit vector with primary weight on index `hotIndex`
function createTestVector(hotIndex: number, length: number = DEFAULT_VECTOR_DIMENSION): number[] {
  const vec = new Array(length).fill(0.0);
  vec[hotIndex] = 1.0;
  return vec;
}

// Helper for slightly perturbed vector close to `hotIndex`
function createPerturbedVector(
  hotIndex: number,
  length: number = DEFAULT_VECTOR_DIMENSION,
): number[] {
  const vec = new Array(length).fill(0.01);
  vec[hotIndex] = 0.95;
  // Normalize Euclidean norm to 1.0
  const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
  return vec.map((v) => v / norm);
}

describe("PostgreSQL + pgvector Integration Tests", () => {
  let pool: pg.Pool;
  let testDocumentId: string | null = null;
  let testDocumentId2: string | null = null;

  before(async () => {
    // Strictly require DATABASE_URL_TEST - fail loudly if not provided
    const connectionString = env.DATABASE_URL_TEST;

    if (!connectionString) {
      throw new Error(
        "DATABASE_URL_TEST is not configured. Please define DATABASE_URL_TEST in .env to run pgvector integration tests against an isolated test database.",
      );
    }

    pool = new Pool({
      connectionString,
      connectionTimeoutMillis: 5000,
    });

    try {
      await pool.query("SELECT 1;");
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Failed to connect to isolated test database at DATABASE_URL_TEST (${connectionString}): ${errorMsg}`,
      );
    }
  });

  after(async () => {
    if (pool) {
      try {
        if (testDocumentId) {
          await pool.query("DELETE FROM documents WHERE id = $1;", [testDocumentId]);
        }
        if (testDocumentId2) {
          await pool.query("DELETE FROM documents WHERE id = $1;", [testDocumentId2]);
        }
      } catch (err) {
        console.error("Cleanup error in integration test after():", err);
      } finally {
        await pool.end();
      }
    }
  });

  it("1. verifies database connectivity and pgvector extension is installed and active", async () => {
    const res = await pool.query<{ extversion: string }>(
      "SELECT extversion FROM pg_extension WHERE extname = 'vector';",
    );
    assert.equal(res.rows.length, 1, "Expected vector extension to be present in pg_extension");
    assert.ok(res.rows[0].extversion, "Extension version must not be empty");
  });

  it("2. verifies documents and document_chunks tables exist with expected schema", async () => {
    const tablesRes = await pool.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('documents', 'document_chunks');",
    );
    const tableNames = tablesRes.rows.map((r) => r.table_name);
    assert.ok(tableNames.includes("documents"), "documents table must exist");
    assert.ok(tableNames.includes("document_chunks"), "document_chunks table must exist");
  });

  it("3. verifies HNSW cosine vector index exists on document_chunks table", async () => {
    const indexRes = await pool.query<{ indexname: string; indexdef: string }>(
      "SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'document_chunks' AND indexname = 'idx_document_chunks_embedding_hnsw';",
    );
    assert.equal(indexRes.rows.length, 1, "Expected HNSW index to exist");
    assert.ok(
      indexRes.rows[0].indexdef.toLowerCase().includes("hnsw"),
      "Index definition must use hnsw",
    );
    assert.ok(
      indexRes.rows[0].indexdef.toLowerCase().includes("vector_cosine_ops"),
      "Index definition must specify vector_cosine_ops",
    );
  });

  it("4. inserts test document and document_chunks with 768-dimensional embeddings", async () => {
    // Insert Document
    const docRes = await pool.query<{ id: string }>(
      `INSERT INTO documents (title, file_path, document_type, raw_text, metadata)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id;`,
      [
        "Test Resume - John Doe",
        "/uploads/test_resume.pdf",
        "resume",
        "John Doe Senior Backend Engineer with TypeScript & PostgreSQL",
        JSON.stringify({ author: "John Doe", version: 1 }),
      ],
    );

    assert.ok(docRes.rows[0].id, "Expected document id to be returned");
    testDocumentId = docRes.rows[0].id;

    // 768-dimensional test vectors:
    // Vec0: Hot on dim 0 (Backend / PostgreSQL)
    // Vec1: Perturbed close to dim 0 (TypeScript Backend)
    // Vec2: Hot on dim 500 (Orthogonal / Graphic Design)
    const vec0 = createTestVector(0);
    const vec1 = createPerturbedVector(0);
    const vec2 = createTestVector(500);

    const chunk1 = await pool.query(
      `INSERT INTO document_chunks (document_id, chunk_index, content, metadata, embedding)
       VALUES ($1, $2, $3, $4, $5::vector)
       RETURNING id;`,
      [
        testDocumentId,
        0,
        "Backend engineering with PostgreSQL and Node.js",
        JSON.stringify({ section: "experience" }),
        toVectorSql(vec0),
      ],
    );

    const chunk2 = await pool.query(
      `INSERT INTO document_chunks (document_id, chunk_index, content, metadata, embedding)
       VALUES ($1, $2, $3, $4, $5::vector)
       RETURNING id;`,
      [
        testDocumentId,
        1,
        "TypeScript architecture and database query optimization",
        JSON.stringify({ section: "skills" }),
        toVectorSql(vec1),
      ],
    );

    const chunk3 = await pool.query(
      `INSERT INTO document_chunks (document_id, chunk_index, content, metadata, embedding)
       VALUES ($1, $2, $3, $4, $5::vector)
       RETURNING id;`,
      [
        testDocumentId,
        2,
        "Visual branding and graphic illustration",
        JSON.stringify({ section: "hobbies" }),
        toVectorSql(vec2),
      ],
    );

    assert.ok(chunk1.rows[0].id);
    assert.ok(chunk2.rows[0].id);
    assert.ok(chunk3.rows[0].id);
  });

  it("5. executes cosine distance (<=>) search returning nearest vectors first", async () => {
    assert.ok(testDocumentId, "testDocumentId must be set");

    // Query with target vector matching dim 0
    const queryVector = toVectorSql(createTestVector(0));

    const result = await pool.query<{
      chunk_index: number;
      content: string;
      distance: number;
    }>(
      `SELECT chunk_index, content, (embedding <=> $1::vector) AS distance
       FROM document_chunks
       WHERE document_id = $2
       ORDER BY embedding <=> $1::vector ASC;`,
      [queryVector, testDocumentId],
    );

    assert.equal(result.rows.length, 3, "Expected 3 chunks returned");

    // Chunk 0 (identical direction) distance should be 0
    assert.equal(result.rows[0].chunk_index, 0);
    assert.ok(Math.abs(result.rows[0].distance - 0.0) < 1e-5, "Exact match distance should be ~0");

    // Chunk 1 (perturbed close direction) should be second nearest
    assert.equal(result.rows[1].chunk_index, 1);
    assert.ok(result.rows[1].distance < 0.2, "Close match distance should be small");

    // Chunk 2 (orthogonal direction on dim 500) distance should be 1.0
    assert.equal(result.rows[2].chunk_index, 2);
    assert.ok(
      Math.abs(result.rows[2].distance - 1.0) < 1e-5,
      "Orthogonal vector cosine distance should be ~1.0",
    );
  });

  it("6. executes Euclidean L2 distance (<->) and negative inner product (<#>) queries", async () => {
    assert.ok(testDocumentId, "testDocumentId must be set");

    const queryVector = toVectorSql(createTestVector(0));

    // L2 Distance (<->)
    const l2Result = await pool.query<{ chunk_index: number; l2_dist: number }>(
      `SELECT chunk_index, (embedding <-> $1::vector) AS l2_dist
       FROM document_chunks
       WHERE document_id = $2
       ORDER BY embedding <-> $1::vector ASC
       LIMIT 1;`,
      [queryVector, testDocumentId],
    );
    assert.equal(l2Result.rows[0].chunk_index, 0);
    assert.ok(Math.abs(l2Result.rows[0].l2_dist - 0.0) < 1e-5);

    // Negative Inner Product (<#>)
    const ipResult = await pool.query<{ chunk_index: number; neg_ip: number }>(
      `SELECT chunk_index, (embedding <#> $1::vector) AS neg_ip
       FROM document_chunks
       WHERE document_id = $2
       ORDER BY embedding <#> $1::vector ASC
       LIMIT 1;`,
      [queryVector, testDocumentId],
    );
    assert.equal(ipResult.rows[0].chunk_index, 0);
    assert.ok(
      Math.abs(ipResult.rows[0].neg_ip - -1.0) < 1e-5,
      "Normalized vector dot product should be -1.0 for <#>",
    );
  });

  it("7. combines relational/metadata filtering with vector similarity ordering", async () => {
    assert.ok(testDocumentId, "testDocumentId must be set");

    const queryVector = toVectorSql(createTestVector(0));

    // Filter specifically by metadata section = 'skills'
    const res = await pool.query<{ chunk_index: number; content: string }>(
      `SELECT chunk_index, content
       FROM document_chunks
       WHERE document_id = $1 AND (metadata->>'section') = $2
       ORDER BY embedding <=> $3::vector ASC
       LIMIT 5;`,
      [testDocumentId, "skills", queryVector],
    );

    assert.equal(res.rows.length, 1);
    assert.equal(res.rows[0].chunk_index, 1);
    assert.ok(res.rows[0].content.includes("TypeScript architecture"));
  });

  it("8. verifies ON DELETE CASCADE removes chunks when parent document is deleted", async () => {
    // Insert a separate test document to test cascade deletion
    const docRes = await pool.query<{ id: string }>(
      `INSERT INTO documents (title, document_type, metadata)
       VALUES ($1, $2, $3)
       RETURNING id;`,
      ["Temp Cascade Test Doc", "resume", "{}"],
    );
    testDocumentId2 = docRes.rows[0].id;

    // Insert a chunk for this document
    await pool.query(
      `INSERT INTO document_chunks (document_id, chunk_index, content, embedding)
       VALUES ($1, $2, $3, $4::vector);`,
      [
        testDocumentId2,
        0,
        "Temporary chunk to verify cascade delete",
        toVectorSql(createTestVector(10)),
      ],
    );

    // Verify chunk exists
    const beforeCount = await pool.query<{ count: string }>(
      "SELECT count(*) FROM document_chunks WHERE document_id = $1;",
      [testDocumentId2],
    );
    assert.equal(parseInt(beforeCount.rows[0].count, 10), 1);

    // Save ID before deleting to avoid using null in verification
    const deletedDocumentId = testDocumentId2;

    // Delete the parent document
    await pool.query("DELETE FROM documents WHERE id = $1;", [deletedDocumentId]);
    testDocumentId2 = null;

    // Verify chunk was automatically deleted via ON DELETE CASCADE using saved deletedDocumentId
    const afterCount = await pool.query<{ count: string }>(
      "SELECT count(*) FROM document_chunks WHERE document_id = $1;",
      [deletedDocumentId],
    );
    assert.equal(parseInt(afterCount.rows[0].count, 10), 0);
  });
});
