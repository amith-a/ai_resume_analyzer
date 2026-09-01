import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import pg from "pg";
import { env } from "../src/config/env.js";
import {
  insertDocument,
  insertDocumentChunks,
  findChunksByDocumentIdOrderedBySimilarity,
} from "../src/repositories/document.repository.js";
import {
  getDocumentById,
  getDocumentChunks,
  deleteDocument,
  storeDocumentWithChunks,
} from "../src/services/document-storage.service.js";
import { DEFAULT_VECTOR_DIMENSION } from "../src/utils/vector.utils.js";
import type { EmbeddingsClient } from "../src/services/embedding.service.js";

const { Pool } = pg;

// Helper to create deterministic normalized vector
function createTestVector(hotIndex: number, length: number = DEFAULT_VECTOR_DIMENSION): number[] {
  const vec = new Array(length).fill(0.001);
  vec[hotIndex] = 0.99;
  const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
  return vec.map((v) => v / norm);
}

describe("Document & Chunks Storage Integration Tests", () => {
  let pool: pg.Pool;
  let testDocumentId1: string | null = null;
  let testDocumentId2: string | null = null;

  before(async () => {
    const connectionString = env.DATABASE_URL_TEST;

    if (!connectionString) {
      throw new Error(
        "DATABASE_URL_TEST is not configured. Please define DATABASE_URL_TEST to run document storage integration tests."
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
        `Failed to connect to isolated test database at DATABASE_URL_TEST (${connectionString}): ${errorMsg}`
      );
    }
  });

  after(async () => {
    if (pool) {
      try {
        if (testDocumentId1) {
          await pool.query("DELETE FROM documents WHERE id = $1;", [testDocumentId1]);
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

  it("1. inserts document and chunks, reads them back, and thoroughly verifies all fields and vector dimensions", async () => {
    // 1. Insert Document via repository
    const createdDoc = await insertDocument(
      {
        title: "Integration Test Resume - Jane Doe",
        document_type: "resume",
        file_path: "/uploads/jane_doe_cv.pdf",
        raw_text: "Full raw resume text for Jane Doe",
        metadata: { candidate: "Jane Doe", seniority: "Senior" },
      },
      pool
    );

    assert.ok(createdDoc.id, "Document must have a valid generated UUID");
    testDocumentId1 = createdDoc.id;

    // 2. Prepare 3 distinct test chunks with 768-dimensional embeddings
    const vec0 = createTestVector(0);
    const vec1 = createTestVector(100);
    const vec2 = createTestVector(250);

    const chunkPayloads = [
      {
        document_id: createdDoc.id,
        chunk_index: 0,
        content: "Senior TypeScript Engineer with 8 years of distributed systems experience.",
        metadata: { section: "summary" },
        embedding: vec0,
      },
      {
        document_id: createdDoc.id,
        chunk_index: 1,
        content: "Architected PostgreSQL databases with pgvector for semantic retrieval.",
        metadata: { section: "experience" },
        embedding: vec1,
      },
      {
        document_id: createdDoc.id,
        chunk_index: 2,
        content: "B.S. in Computer Science, graduated with honors.",
        metadata: { section: "education" },
        embedding: vec2,
      },
    ];

    const storedChunks = await insertDocumentChunks(chunkPayloads, pool);
    assert.equal(storedChunks.length, 3, "Expected 3 chunks inserted");

    // 3. READ BACK: Fetch document by ID and verify
    const retrievedDoc = await getDocumentById(createdDoc.id, pool);
    assert.ok(retrievedDoc, "Retrieved document must exist");
    assert.equal(retrievedDoc.id, createdDoc.id);
    assert.equal(retrievedDoc.title, "Integration Test Resume - Jane Doe");
    assert.equal(retrievedDoc.document_type, "resume");
    assert.equal(retrievedDoc.file_path, "/uploads/jane_doe_cv.pdf");
    assert.equal(retrievedDoc.raw_text, "Full raw resume text for Jane Doe");
    assert.deepEqual(retrievedDoc.metadata, { candidate: "Jane Doe", seniority: "Senior" });
    assert.ok(retrievedDoc.created_at instanceof Date);
    assert.ok(retrievedDoc.updated_at instanceof Date);

    // 4. READ BACK: Fetch chunks by document_id and verify all fields & vector round-trip
    const retrievedChunks = await getDocumentChunks(createdDoc.id, pool);
    assert.equal(retrievedChunks.length, 3, "Expected exactly 3 chunks returned");

    for (let i = 0; i < retrievedChunks.length; i++) {
      const chunk = retrievedChunks[i];
      const original = chunkPayloads[i];

      // Verify foreign key relationship
      assert.equal(chunk.document_id, createdDoc.id, `Chunk ${i} document_id must match parent document`);
      // Verify sequential ordering
      assert.equal(chunk.chunk_index, i, `Chunk ${i} chunk_index must equal ${i}`);
      // Verify content
      assert.equal(chunk.content, original.content, `Chunk ${i} content must match inserted text`);
      // Verify metadata
      assert.deepEqual(chunk.metadata, original.metadata, `Chunk ${i} metadata must match`);

      // Verify 768-dim vector embedding
      assert.ok(Array.isArray(chunk.embedding), `Chunk ${i} embedding must be an array of numbers`);
      const embedding = chunk.embedding;
      assert.equal(embedding.length, DEFAULT_VECTOR_DIMENSION, `Chunk ${i} embedding must have 768 dimensions`);

      // Verify numerical precision round-trip for each vector coordinate
      for (let d = 0; d < DEFAULT_VECTOR_DIMENSION; d++) {
        const expectedVal = original.embedding[d];
        const retrievedVal = embedding[d];
        assert.ok(
          Math.abs(retrievedVal - expectedVal) < 1e-4,
          `Chunk ${i} dimension ${d} value mismatch: expected ${expectedVal}, got ${retrievedVal}`
        );
      }
    }
  });

  it("2. executes end-to-end storeDocumentWithChunks, reads back, and verifies cascade deletion", async () => {
    const rawResumeText = `
Summary:
Full-stack software developer with expertise in Node.js and PostgreSQL.

Experience:
Built AI pipeline services and semantic search engines using pgvector.
Maintained containerized Docker environments with high availability.

Education:
Master of Science in Software Engineering.
    `.trim();

    const mockEmbeddingsClient: EmbeddingsClient = {
      embedQuery: async () => createTestVector(0),
      embedDocuments: async (texts: string[]) => texts.map((_, i) => createTestVector(i * 10)),
    };

    // Store document + chunks end-to-end via service
    const storeResult = await storeDocumentWithChunks(
      {
        title: "End-to-End Test Resume",
        document_type: "resume",
        raw_text: rawResumeText,
        metadata: { source: "e2e_test" },
        chunkOptions: { chunkSize: 120, chunkOverlap: 20 },
      },
      {
        embeddingsClient: mockEmbeddingsClient,
        pool,
      }
    );

    testDocumentId2 = storeResult.document.id;
    assert.ok(testDocumentId2, "Document ID must be present");
    assert.ok(storeResult.chunks.length > 1, "Expected multiple chunks to be created from raw text");

    // READ BACK: Verify all chunks stored by the pipeline
    const fetchedChunks = await getDocumentChunks(testDocumentId2, pool);
    assert.equal(fetchedChunks.length, storeResult.chunks.length);

    for (let i = 0; i < fetchedChunks.length; i++) {
      const chunk = fetchedChunks[i];
      assert.equal(chunk.document_id, testDocumentId2);
      assert.equal(chunk.chunk_index, i);
      assert.ok(chunk.content.length > 0);
      assert.ok(Array.isArray(chunk.embedding));
      assert.equal(chunk.embedding.length, 768);
    }

    // Verify cascade deletion
    const deleteSuccess = await deleteDocument(testDocumentId2, pool);
    assert.equal(deleteSuccess, true, "Delete document should return true");
    testDocumentId2 = null;

    // Verify document no longer exists
    const docAfterDelete = await getDocumentById(storeResult.document.id, pool);
    assert.equal(docAfterDelete, null, "Document should be null after deletion");

    // Verify chunks were cascade deleted
    const chunksAfterDelete = await getDocumentChunks(storeResult.document.id, pool);
    assert.equal(chunksAfterDelete.length, 0, "All chunks must be deleted after document deletion");
  });

  it("3. executes vector retrieval (findChunksByDocumentIdOrderedBySimilarity) verifying document scoping, cosine distance ordering, and external document exclusion", async () => {
    // 1. Create Document A
    const docA = await insertDocument(
      {
        title: "Candidate A Document",
        document_type: "resume",
        raw_text: "Text A",
      },
      pool
    );
    testDocumentId1 = docA.id;

    // 2. Create Document B (external document to verify scoping)
    const docB = await insertDocument(
      {
        title: "Candidate B Document",
        document_type: "resume",
        raw_text: "Text B",
      },
      pool
    );
    testDocumentId2 = docB.id;

    // 3. Known orthogonal / deterministic vectors
    // Vec 0: Unit vector on dim 0
    const vec0 = createTestVector(0);

    // Vec 1: Slightly perturbed vector close to dim 0 (cosine distance ~ 0.05)
    const vec1 = new Array(DEFAULT_VECTOR_DIMENSION).fill(0.01);
    vec1[0] = 0.95;
    const norm1 = Math.sqrt(vec1.reduce((sum, v) => sum + v * v, 0));
    const normalizedVec1 = vec1.map((v) => v / norm1);

    // Vec 2: Orthogonal vector on dim 500 (cosine distance ~ 1.0)
    const vec2 = createTestVector(500);

    // Insert Chunks for Document A
    await insertDocumentChunks(
      [
        {
          document_id: docA.id,
          chunk_index: 0,
          content: "TypeScript and Node.js Backend Architecture",
          metadata: { topic: "backend" },
          embedding: vec0, // Exact direction match with query
        },
        {
          document_id: docA.id,
          chunk_index: 1,
          content: "PostgreSQL Database Design and Query Tuning",
          metadata: { topic: "database" },
          embedding: normalizedVec1, // Near direction match with query
        },
        {
          document_id: docA.id,
          chunk_index: 2,
          content: "Graphic Design and Creative Visual Arts",
          metadata: { topic: "design" },
          embedding: vec2, // Orthogonal direction to query
        },
      ],
      pool
    );

    // Insert Chunk for Document B with exact query vector (must NOT appear in results for Doc A)
    await insertDocumentChunks(
      [
        {
          document_id: docB.id,
          chunk_index: 0,
          content: "External Candidate Matching Skillset",
          metadata: { topic: "backend" },
          embedding: vec0,
        },
      ],
      pool
    );

    // 4. Query vector matching dim 0
    const queryVector = createTestVector(0);

    // 5. Test topK = 1: Returns exactly 1 (the single closest chunk)
    const top1 = await findChunksByDocumentIdOrderedBySimilarity(docA.id, queryVector, 1, undefined, undefined, pool);
    assert.equal(top1.length, 1, "topK = 1 must return exactly 1 chunk");
    assert.equal(top1[0].chunk_index, 0, "Top 1 chunk must be the closest chunk");
    assert.ok(Math.abs(top1[0].distance - 0.0) < 1e-4);
    assert.equal(top1[0].content, "TypeScript and Node.js Backend Architecture");
    assert.equal(top1[0].document_id, docA.id);

    // 6. Test topK = 2: Returns the 2 closest chunks in ascending distance order
    const top2 = await findChunksByDocumentIdOrderedBySimilarity(docA.id, queryVector, 2, undefined, undefined, pool);
    assert.equal(top2.length, 2, "topK = 2 must return exactly 2 chunks");
    assert.equal(top2[0].chunk_index, 0);
    assert.equal(top2[1].chunk_index, 1);
    assert.ok(top2[0].distance <= top2[1].distance);
    assert.ok(top2[1].distance < 0.2);
    assert.equal(top2[1].content, "PostgreSQL Database Design and Query Tuning");

    // 7. Test topK = 10 (larger than available 3 chunks): Returns all 3 available matching chunks
    const top10 = await findChunksByDocumentIdOrderedBySimilarity(docA.id, queryVector, 10, undefined, undefined, pool);
    assert.equal(top10.length, 3, "topK = 10 must return all 3 available chunks for document A");
    assert.equal(top10[0].chunk_index, 0);
    assert.equal(top10[1].chunk_index, 1);
    assert.equal(top10[2].chunk_index, 2);
    assert.ok(top10[0].distance <= top10[1].distance);
    assert.ok(top10[1].distance <= top10[2].distance);

    // Verify all returned chunks strictly belong to Document A (Document B is excluded)
    for (const chunk of top10) {
      assert.equal(chunk.document_id, docA.id, "Chunk must belong strictly to document A");
      assert.notEqual(chunk.document_id, docB.id, "Document B chunks must be excluded");
      assert.notEqual(chunk.content, "External Candidate Matching Skillset");
    }

    // 8. Test invalid topK values are rejected with RangeError
    await assert.rejects(
      async () => {
        await findChunksByDocumentIdOrderedBySimilarity(docA.id, queryVector, 0, undefined, undefined, pool);
      },
      { name: "RangeError", message: /topK must be a positive integer/ }
    );

    await assert.rejects(
      async () => {
        await findChunksByDocumentIdOrderedBySimilarity(docA.id, queryVector, -2, undefined, undefined, pool);
      },
      { name: "RangeError", message: /topK must be a positive integer/ }
    );

    await assert.rejects(
      async () => {
        await findChunksByDocumentIdOrderedBySimilarity(docA.id, queryVector, 1.5, undefined, undefined, pool);
      },
      { name: "RangeError", message: /topK must be a positive integer/ }
    );
  });

  it("4. executes vector retrieval with similarity threshold (maxDistanceThreshold) verifying inclusion, exclusion, boundary, and empty results", async () => {
    // 1. Create Document
    const doc = await insertDocument(
      {
        title: "Threshold Test Document",
        document_type: "resume",
        raw_text: "Threshold text content",
      },
      pool
    );
    testDocumentId1 = doc.id;

    // 2. Insert 3 chunks with deterministic distances from query vector (dim 0):
    // Chunk 0: exact match (dim 0) -> distance ≈ 0.0
    // Chunk 1: close match (perturbed dim 0) -> distance ≈ 0.05
    // Chunk 2: orthogonal (dim 500) -> distance ≈ 1.0
    const vec0 = createTestVector(0);

    const vec1 = new Array(DEFAULT_VECTOR_DIMENSION).fill(0.01);
    vec1[0] = 0.95;
    const norm1 = Math.sqrt(vec1.reduce((sum, v) => sum + v * v, 0));
    const normalizedVec1 = vec1.map((v) => v / norm1);

    const vec2 = createTestVector(500);

    await insertDocumentChunks(
      [
        {
          document_id: doc.id,
          chunk_index: 0,
          content: "Chunk 0 exact match",
          embedding: vec0,
        },
        {
          document_id: doc.id,
          chunk_index: 1,
          content: "Chunk 1 close match",
          embedding: normalizedVec1,
        },
        {
          document_id: doc.id,
          chunk_index: 2,
          content: "Chunk 2 orthogonal match",
          embedding: vec2,
        },
      ],
      pool
    );

    const queryVector = createTestVector(0);

    // 3. Test threshold = 0.20: Chunks with distance <= 0.20 included (chunk 0 and chunk 1), chunk 2 (> 0.20) excluded
    const threshold02 = await findChunksByDocumentIdOrderedBySimilarity(doc.id, queryVector, 10, 0.20, undefined, pool);
    assert.equal(threshold02.length, 2, "Threshold 0.20 should include exactly chunk 0 and chunk 1");
    assert.equal(threshold02[0].chunk_index, 0);
    assert.equal(threshold02[1].chunk_index, 1);
    assert.ok(threshold02[0].distance <= 0.20);
    assert.ok(threshold02[1].distance <= 0.20);

    // 4. Test threshold = 0.01: Only chunk 0 (distance ~ 0.0) is included; chunk 1 (distance ~ 0.05) and chunk 2 excluded
    const threshold001 = await findChunksByDocumentIdOrderedBySimilarity(doc.id, queryVector, 10, 0.01, undefined, pool);
    assert.equal(threshold001.length, 1, "Threshold 0.01 should include only chunk 0");
    assert.equal(threshold001[0].chunk_index, 0);

    // 5. Test boundary: threshold set to exact distance of chunk 1 -> chunk 1 must be included (<=)
    const chunk1Distance = threshold02[1].distance;
    const boundaryResults = await findChunksByDocumentIdOrderedBySimilarity(doc.id, queryVector, 10, chunk1Distance, undefined, pool);
    assert.equal(boundaryResults.length, 2, "Exact distance boundary must include chunk 1");
    assert.equal(boundaryResults[1].chunk_index, 1);

    // 6. Test threshold combined with topK: topK = 1 with threshold = 0.50 -> returns at most 1 chunk
    const top1WithThreshold = await findChunksByDocumentIdOrderedBySimilarity(doc.id, queryVector, 1, 0.50, undefined, pool);
    assert.equal(top1WithThreshold.length, 1, "topK = 1 with threshold must limit to 1 chunk");
    assert.equal(top1WithThreshold[0].chunk_index, 0);

    // 7. Test no qualifying chunks: query vector orthogonal to all or threshold lower than any chunk distance
    const orthogonalQuery = createTestVector(700);
    const noResults = await findChunksByDocumentIdOrderedBySimilarity(doc.id, orthogonalQuery, 10, 0.10, undefined, pool);
    assert.deepEqual(noResults, [], "If no chunks satisfy threshold, empty array must be returned");

    // 8. Test invalid threshold values are rejected with RangeError
    await assert.rejects(
      async () => {
        await findChunksByDocumentIdOrderedBySimilarity(doc.id, queryVector, 5, -0.5, undefined, pool);
      },
      { name: "RangeError", message: /maxDistanceThreshold must be a non-negative finite number/ }
    );

    await assert.rejects(
      async () => {
        await findChunksByDocumentIdOrderedBySimilarity(doc.id, queryVector, 5, NaN, undefined, pool);
      },
      { name: "RangeError", message: /maxDistanceThreshold must be a non-negative finite number/ }
    );
  });

  it("5. executes vector retrieval with metadata filtering (metadataFilter) verifying single/multiple conditions, exclusion, and combination with threshold", async () => {
    // 1. Create Document A and Document B
    const docA = await insertDocument(
      {
        title: "Metadata Test Doc A",
        document_type: "resume",
        raw_text: "Doc A content",
      },
      pool
    );
    testDocumentId1 = docA.id;

    const docB = await insertDocument(
      {
        title: "Metadata Test Doc B",
        document_type: "resume",
        raw_text: "Doc B content",
      },
      pool
    );
    testDocumentId2 = docB.id;

    const vec0 = createTestVector(0);
    const vec1 = createTestVector(100);
    const vec2 = createTestVector(200);

    // Insert chunks with distinct metadata for Document A
    await insertDocumentChunks(
      [
        {
          document_id: docA.id,
          chunk_index: 0,
          content: "Chunk 0: Lead Backend Architect",
          metadata: { section: "experience", seniority: "lead", domain: "cloud" },
          embedding: vec0,
        },
        {
          document_id: docA.id,
          chunk_index: 1,
          content: "Chunk 1: TypeScript and PostgreSQL Skills",
          metadata: { section: "skills", domain: "cloud" },
          embedding: vec1,
        },
        {
          document_id: docA.id,
          chunk_index: 2,
          content: "Chunk 2: Education and Master's Degree",
          metadata: { section: "education", degree: "masters" },
          embedding: vec2,
        },
      ],
      pool
    );

    // Insert chunk for Document B with matching metadata (must be excluded by document_id)
    await insertDocumentChunks(
      [
        {
          document_id: docB.id,
          chunk_index: 0,
          content: "Doc B Chunk: Lead Backend Architect in External Candidate",
          metadata: { section: "experience", seniority: "lead" },
          embedding: vec0,
        },
      ],
      pool
    );

    const queryVector = createTestVector(0);

    // 2. Filter by single metadata key: section = "skills"
    const skillsResults = await findChunksByDocumentIdOrderedBySimilarity(
      docA.id,
      queryVector,
      10,
      undefined,
      { section: "skills" },
      pool
    );
    assert.equal(skillsResults.length, 1, "Should return only the 1 skills chunk");
    assert.equal(skillsResults[0].chunk_index, 1);
    assert.equal(skillsResults[0].content, "Chunk 1: TypeScript and PostgreSQL Skills");

    // 3. Filter by multiple metadata keys: section = "experience" AND seniority = "lead"
    const leadExpResults = await findChunksByDocumentIdOrderedBySimilarity(
      docA.id,
      queryVector,
      10,
      undefined,
      { section: "experience", seniority: "lead" },
      pool
    );
    assert.equal(leadExpResults.length, 1);
    assert.equal(leadExpResults[0].chunk_index, 0);
    assert.equal(leadExpResults[0].document_id, docA.id);

    // 4. Non-matching metadata filter returns empty array
    const noMatchResults = await findChunksByDocumentIdOrderedBySimilarity(
      docA.id,
      queryVector,
      10,
      undefined,
      { section: "certifications" },
      pool
    );
    assert.deepEqual(noMatchResults, [], "Non-matching metadata filter should return empty array");

    // 5. Combined metadata filter + maxDistanceThreshold + topK
    const combinedResults = await findChunksByDocumentIdOrderedBySimilarity(
      docA.id,
      queryVector,
      5,
      0.10,
      { domain: "cloud" },
      pool
    );
    // domain = "cloud" matches chunks 0 and 1, but chunk 0 has distance ~0.0 <= 0.10 and chunk 1 has distance ~1.0 > 0.10
    assert.equal(combinedResults.length, 1, "Combined filters should return only chunk 0");
    assert.equal(combinedResults[0].chunk_index, 0);

    // 6. Invalid metadataFilter validation rejects with TypeError
    await assert.rejects(
      async () => {
        await findChunksByDocumentIdOrderedBySimilarity(
          docA.id,
          queryVector,
          5,
          undefined,
          "invalid-filter" as unknown as Record<string, unknown>,
          pool
        );
      },
      { name: "TypeError", message: /metadataFilter must be a valid object/ }
    );
  });
});

