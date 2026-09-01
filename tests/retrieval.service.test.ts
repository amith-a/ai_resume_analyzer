import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { retrieveChunks } from "../src/services/retrieval.service.js";
import type { EmbeddingsClient } from "../src/services/embedding.service.js";
import { UpstreamAIError } from "../src/errors/index.js";
import type { DocumentChunkWithDistanceRecord } from "../src/types/document.types.js";

const DEFAULT_VECTOR_DIMENSION = 768;

function createMockVector(fillValue = 0.1): number[] {
  const vec = new Array(DEFAULT_VECTOR_DIMENSION).fill(fillValue);
  vec[0] = 1.0;
  return vec;
}

describe("Retrieval Service Unit Tests", () => {
  it("1. orchestrates embedding generation and repository vector retrieval successfully", async () => {
    const mockVector = createMockVector(0.05);
    let embeddedQueryText = "";

    const mockEmbeddingsClient: EmbeddingsClient = {
      embedQuery: async (text: string) => {
        embeddedQueryText = text;
        return mockVector;
      },
    };

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
        query: "backend nodejs developer",
        documentId: "doc-123",
        topK: 3,
        maxDistanceThreshold: 0.2,
        metadataFilter: { section: "experience" },
      },
      {
        embeddingsClient: mockEmbeddingsClient,
        vectorRepository: mockVectorRepo,
      },
    );

    // 1. Verify query passed to embedding service
    assert.equal(embeddedQueryText, "backend nodejs developer");

    // 2. Verify repository received correct parameters
    assert.equal(repoDocumentId, "doc-123");
    assert.deepEqual(repoVector, mockVector);
    assert.equal(repoTopK, 3);
    assert.equal(repoThreshold, 0.2);
    assert.deepEqual(repoMetadataFilter, { section: "experience" });

    // 3. Verify retrieved chunks returned unchanged
    assert.equal(result.length, 2);
    assert.equal(result[0].id, "chunk-1");
    assert.equal(result[0].distance, 0.045);
    assert.equal(result[1].id, "chunk-2");
    assert.equal(result[1].distance, 0.12);
  });

  it("2. defaults topK to 5 when topK is omitted", async () => {
    const mockVector = createMockVector();
    let repoTopK = 0;

    const mockEmbeddingsClient: EmbeddingsClient = {
      embedQuery: async () => mockVector,
    };

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
        query: "find matching skills",
        documentId: "doc-456",
      },
      {
        embeddingsClient: mockEmbeddingsClient,
        vectorRepository: mockVectorRepo,
      },
    );

    assert.equal(repoTopK, 5, "topK should default to 5 when omitted");
  });

  it("3. rejects empty or invalid query with TypeError", async () => {
    await assert.rejects(
      async () => {
        await retrieveChunks({
          query: "",
          documentId: "doc-123",
        });
      },
      { name: "TypeError", message: /Query must be a non-empty string/ },
    );

    await assert.rejects(
      async () => {
        await retrieveChunks({
          query: "   ",
          documentId: "doc-123",
        });
      },
      { name: "TypeError", message: /Query must be a non-empty string/ },
    );
  });

  it("4. rejects empty or invalid documentId with TypeError", async () => {
    await assert.rejects(
      async () => {
        await retrieveChunks({
          query: "find backend skills",
          documentId: "",
        });
      },
      { name: "TypeError", message: /Document ID must be a non-empty string/ },
    );

    await assert.rejects(
      async () => {
        await retrieveChunks({
          query: "find backend skills",
          documentId: "   ",
        });
      },
      { name: "TypeError", message: /Document ID must be a non-empty string/ },
    );
  });

  it("5. rejects invalid topK values (0, negative, float, NaN) with RangeError", async () => {
    await assert.rejects(
      async () => {
        await retrieveChunks({
          query: "find backend skills",
          documentId: "doc-123",
          topK: 0,
        });
      },
      { name: "RangeError", message: /topK must be a positive integer/ },
    );

    await assert.rejects(
      async () => {
        await retrieveChunks({
          query: "find backend skills",
          documentId: "doc-123",
          topK: -5,
        });
      },
      { name: "RangeError", message: /topK must be a positive integer/ },
    );

    await assert.rejects(
      async () => {
        await retrieveChunks({
          query: "find backend skills",
          documentId: "doc-123",
          topK: 2.5,
        });
      },
      { name: "RangeError", message: /topK must be a positive integer/ },
    );

    await assert.rejects(
      async () => {
        await retrieveChunks({
          query: "find backend skills",
          documentId: "doc-123",
          topK: NaN,
        });
      },
      { name: "RangeError", message: /topK must be a positive integer/ },
    );
  });

  it("6. propagates UpstreamAIError when embedding generation fails", async () => {
    const mockEmbeddingsClient: EmbeddingsClient = {
      embedQuery: async () => {
        throw new Error("Ollama connection failed");
      },
    };

    await assert.rejects(
      async () => {
        await retrieveChunks(
          {
            query: "query that fails",
            documentId: "doc-123",
          },
          {
            embeddingsClient: mockEmbeddingsClient,
          },
        );
      },
      (err: unknown) => {
        assert.ok(err instanceof UpstreamAIError);
        assert.match(err.message, /Failed to generate text embedding/);
        return true;
      },
    );
  });

  it("7. propagates repository errors directly to the caller", async () => {
    const mockVector = createMockVector();
    const mockEmbeddingsClient: EmbeddingsClient = {
      embedQuery: async () => mockVector,
    };

    const mockVectorRepo = {
      findChunksByDocumentIdOrderedBySimilarity: async () => {
        throw new Error("Database query failed: connection closed");
      },
    };

    await assert.rejects(
      async () => {
        await retrieveChunks(
          {
            query: "valid query",
            documentId: "doc-123",
          },
          {
            embeddingsClient: mockEmbeddingsClient,
            vectorRepository: mockVectorRepo,
          },
        );
      },
      { message: /Database query failed: connection closed/ },
    );
  });
});
