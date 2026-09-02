import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { orchestrateRagRetrieval } from "../src/services/rag-retrieval.service.js";
import type { EmbeddingsClient } from "../src/services/embedding.service.js";
import { UpstreamAIError } from "../src/errors/index.js";
import type {
  DocumentChunkWithDistanceRecord,
  RetrieveChunksParams,
} from "../src/types/document.types.js";

const DEFAULT_VECTOR_DIMENSION = 768;

function createMockVector(fillValue = 0.1): number[] {
  const vec = new Array(DEFAULT_VECTOR_DIMENSION).fill(fillValue);
  vec[0] = 1.0;
  return vec;
}

describe("RAG Retrieval Orchestration Service Unit Tests", () => {
  it("1. Query → Embedding → Retrieval: generates query embedding and passes vector to retrieval service", async () => {
    const mockVector = createMockVector(0.05);
    const mockChunks: DocumentChunkWithDistanceRecord[] = [
      {
        id: "chunk-aws-1",
        document_id: "doc-uuid-101",
        chunk_index: 0,
        content: "Senior Backend Developer with AWS architecture experience.",
        metadata: { section: "experience" },
        embedding: mockVector,
        distance: 0.05,
        created_at: new Date(),
      },
    ];

    let passedParams: RetrieveChunksParams | undefined;

    const mockEmbeddingsClient: EmbeddingsClient = {
      embedQuery: async () => mockVector,
    };

    const mockRetrieveChunks = async (params: RetrieveChunksParams) => {
      passedParams = params;
      return mockChunks;
    };

    const result = await orchestrateRagRetrieval(
      {
        query: "backend developer with AWS experience",
        documentId: "doc-uuid-101",
      },
      {
        embeddingsClient: mockEmbeddingsClient,
        retrieveChunks: mockRetrieveChunks,
      },
    );

    assert.ok(passedParams);
    assert.equal(passedParams.documentId, "doc-uuid-101");
    assert.deepEqual(passedParams.queryVector, mockVector);
    assert.equal(result.length, 1);
    assert.equal(result[0].id, "chunk-aws-1");
  });

  it("2. Retrieval Options: forwards documentId, topK, maxDistanceThreshold, and metadataFilter without modification", async () => {
    const mockVector = createMockVector(0.05);
    let passedParams: RetrieveChunksParams | undefined;

    const mockEmbeddingsClient: EmbeddingsClient = {
      embedQuery: async () => mockVector,
    };

    const mockRetrieveChunks = async (params: RetrieveChunksParams) => {
      passedParams = params;
      return [];
    };

    const filterObj = { section: "projects", tech: "AWS" };

    await orchestrateRagRetrieval(
      {
        query: "cloud infrastructure",
        documentId: "doc-uuid-202",
        topK: 10,
        maxDistanceThreshold: 0.35,
        metadataFilter: filterObj,
      },
      {
        embeddingsClient: mockEmbeddingsClient,
        retrieveChunks: mockRetrieveChunks,
      },
    );

    assert.ok(passedParams);
    assert.equal(passedParams.documentId, "doc-uuid-202");
    assert.deepEqual(passedParams.queryVector, mockVector);
    assert.equal(passedParams.topK, 10);
    assert.equal(passedParams.maxDistanceThreshold, 0.35);
    assert.deepEqual(passedParams.metadataFilter, filterObj);
  });

  it("3. Embedding Failure: propagates UpstreamAIError when embedding generation fails", async () => {
    const mockEmbeddingsClient: EmbeddingsClient = {
      embedQuery: async () => {
        throw new Error("Ollama connection timeout");
      },
    };

    await assert.rejects(
      async () => {
        await orchestrateRagRetrieval(
          {
            query: "backend developer with AWS experience",
            documentId: "doc-uuid-101",
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

  it("4. Retrieval Failure: propagates retrieval service errors directly to caller", async () => {
    const mockVector = createMockVector(0.05);

    const mockEmbeddingsClient: EmbeddingsClient = {
      embedQuery: async () => mockVector,
    };

    const mockRetrieveChunks = async () => {
      throw new Error("Retrieval failed: connection reset");
    };

    await assert.rejects(
      async () => {
        await orchestrateRagRetrieval(
          {
            query: "backend developer",
            documentId: "doc-uuid-101",
          },
          {
            embeddingsClient: mockEmbeddingsClient,
            retrieveChunks: mockRetrieveChunks,
          },
        );
      },
      { message: /Retrieval failed: connection reset/ },
    );
  });

  it("5. Input Validation: rejects invalid query or documentId", async () => {
    const mockEmbeddingsClient: EmbeddingsClient = {
      embedQuery: async () => createMockVector(),
    };

    await assert.rejects(
      async () => {
        await orchestrateRagRetrieval(
          {
            query: "",
            documentId: "doc-123",
          },
          {
            embeddingsClient: mockEmbeddingsClient,
          },
        );
      },
      { name: "TypeError", message: /non-empty string/ },
    );

    await assert.rejects(
      async () => {
        await orchestrateRagRetrieval(
          {
            query: "valid query",
            documentId: "",
          },
          {
            embeddingsClient: mockEmbeddingsClient,
          },
        );
      },
      { name: "TypeError", message: /Document ID must be a non-empty string/ },
    );
  });
});
