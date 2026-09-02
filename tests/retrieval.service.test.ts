import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { retrieveChunks } from "../src/services/retrieval.service.js";
import type { DocumentChunkWithDistanceRecord } from "../src/types/document.types.js";

const DEFAULT_VECTOR_DIMENSION = 768;

function createMockVector(fillValue = 0.1): number[] {
  const vec = new Array(DEFAULT_VECTOR_DIMENSION).fill(fillValue);
  vec[0] = 1.0;
  return vec;
}

describe("Retrieval Service Unit Tests (Vector Retrieval Only)", () => {
  it("1. passes query vector directly to repository and returns matching chunks", async () => {
    const mockVector = createMockVector(0.05);

    const mockChunks: DocumentChunkWithDistanceRecord[] = [
      {
        id: "chunk-1",
        document_id: "doc-123",
        chunk_index: 0,
        content: "Senior Backend Developer with Node.js and PostgreSQL",
        metadata: { section: "experience" },
        embedding: mockVector,
        distance: 0.045,
        created_at: new Date(),
      },
      {
        id: "chunk-2",
        document_id: "doc-123",
        chunk_index: 1,
        content: "Distributed Systems Architecture",
        metadata: { section: "experience" },
        embedding: mockVector,
        distance: 0.12,
        created_at: new Date(),
      },
    ];

    let repoDocumentId = "";
    let repoVector: number[] | Float32Array = [];
    let repoTopK = 0;
    let repoThreshold: number | undefined;
    let repoMetadataFilter: Record<string, unknown> | undefined;

    const mockVectorRepo = {
      findChunksByDocumentIdOrderedBySimilarity: async (
        docId: string,
        vec: number[] | Float32Array,
        topK: number,
        threshold?: number,
        metadataFilter?: Record<string, unknown>,
      ) => {
        repoDocumentId = docId;
        repoVector = vec;
        repoTopK = topK;
        repoThreshold = threshold;
        repoMetadataFilter = metadataFilter;
        return mockChunks;
      },
    };

    const result = await retrieveChunks(
      {
        documentId: "doc-123",
        queryVector: mockVector,
        topK: 3,
        maxDistanceThreshold: 0.2,
        metadataFilter: { section: "experience" },
      },
      {
        vectorRepository: mockVectorRepo,
      },
    );

    assert.equal(repoDocumentId, "doc-123");
    assert.deepEqual(repoVector, mockVector);
    assert.equal(repoTopK, 3);
    assert.equal(repoThreshold, 0.2);
    assert.deepEqual(repoMetadataFilter, { section: "experience" });

    assert.equal(result.length, 2);
    assert.equal(result[0].id, "chunk-1");
    assert.equal(result[0].distance, 0.045);
    assert.equal(result[1].id, "chunk-2");
    assert.equal(result[1].distance, 0.12);
  });

  it("2. defaults topK to 5 when omitted", async () => {
    const mockVector = createMockVector();
    let repoTopK = 0;

    const mockVectorRepo = {
      findChunksByDocumentIdOrderedBySimilarity: async (
        _docId: string,
        _vec: number[] | Float32Array,
        topK: number,
      ) => {
        repoTopK = topK;
        return [];
      },
    };

    await retrieveChunks(
      {
        documentId: "doc-456",
        queryVector: mockVector,
      },
      {
        vectorRepository: mockVectorRepo,
      },
    );

    assert.equal(repoTopK, 5);
  });

  it("3. rejects missing or empty queryVector with TypeError", async () => {
    await assert.rejects(
      async () => {
        await retrieveChunks({
          documentId: "doc-123",
          queryVector: [] as number[],
        });
      },
      { name: "TypeError", message: /Query vector must be a non-empty array of numbers/ },
    );

    await assert.rejects(
      async () => {
        await retrieveChunks({
          documentId: "doc-123",
          queryVector: null as unknown as number[],
        });
      },
      { name: "TypeError", message: /Query vector must be a non-empty array of numbers/ },
    );
  });

  it("4. rejects empty or whitespace documentId with TypeError", async () => {
    const mockVector = createMockVector();

    await assert.rejects(
      async () => {
        await retrieveChunks({
          documentId: "",
          queryVector: mockVector,
        });
      },
      { name: "TypeError", message: /Document ID must be a non-empty string/ },
    );

    await assert.rejects(
      async () => {
        await retrieveChunks({
          documentId: "   ",
          queryVector: mockVector,
        });
      },
      { name: "TypeError", message: /Document ID must be a non-empty string/ },
    );
  });

  it("5. rejects invalid topK values (0, negative, float, NaN) with RangeError", async () => {
    const mockVector = createMockVector();

    await assert.rejects(
      async () => {
        await retrieveChunks({
          documentId: "doc-123",
          queryVector: mockVector,
          topK: 0,
        });
      },
      { name: "RangeError", message: /topK must be a positive integer/ },
    );

    await assert.rejects(
      async () => {
        await retrieveChunks({
          documentId: "doc-123",
          queryVector: mockVector,
          topK: -5,
        });
      },
      { name: "RangeError", message: /topK must be a positive integer/ },
    );

    await assert.rejects(
      async () => {
        await retrieveChunks({
          documentId: "doc-123",
          queryVector: mockVector,
          topK: 2.5,
        });
      },
      { name: "RangeError", message: /topK must be a positive integer/ },
    );

    await assert.rejects(
      async () => {
        await retrieveChunks({
          documentId: "doc-123",
          queryVector: mockVector,
          topK: NaN,
        });
      },
      { name: "RangeError", message: /topK must be a positive integer/ },
    );
  });

  it("6. rejects invalid maxDistanceThreshold with RangeError", async () => {
    const mockVector = createMockVector();

    await assert.rejects(
      async () => {
        await retrieveChunks({
          documentId: "doc-123",
          queryVector: mockVector,
          maxDistanceThreshold: -0.1,
        });
      },
      { name: "RangeError", message: /maxDistanceThreshold must be a non-negative finite number/ },
    );

    await assert.rejects(
      async () => {
        await retrieveChunks({
          documentId: "doc-123",
          queryVector: mockVector,
          maxDistanceThreshold: NaN,
        });
      },
      { name: "RangeError", message: /maxDistanceThreshold must be a non-negative finite number/ },
    );
  });

  it("7. propagates repository errors directly to the caller", async () => {
    const mockVector = createMockVector();

    const mockVectorRepo = {
      findChunksByDocumentIdOrderedBySimilarity: async () => {
        throw new Error("Database query failed: connection closed");
      },
    };

    await assert.rejects(
      async () => {
        await retrieveChunks(
          {
            documentId: "doc-123",
            queryVector: mockVector,
          },
          {
            vectorRepository: mockVectorRepo,
          },
        );
      },
      { message: /Database query failed: connection closed/ },
    );
  });
});
