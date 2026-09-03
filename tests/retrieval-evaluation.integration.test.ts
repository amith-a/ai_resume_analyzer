import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { orchestrateRagRetrieval } from "../src/services/rag-retrieval.service.js";
import {
  evaluateRetrieval,
  type RetrievalEvaluationCase,
} from "../src/services/retrieval-evaluation.service.js";
import type { EmbeddingsClient } from "../src/services/embedding.service.js";
import type {
  DocumentChunkWithDistanceRecord,
  RetrieveChunksParams,
} from "../src/types/document.types.js";

const DEFAULT_VECTOR_DIMENSION = 768;
const TEST_DOC_UUID = "33333333-3333-3333-3333-333333333333";

function createMockVector(fillValue = 0.1): number[] {
  const vec = new Array(DEFAULT_VECTOR_DIMENSION).fill(fillValue);
  vec[0] = 1.0;
  return vec;
}

describe("Retrieval Evaluation Integration Tests (Phase 13 — Block 4)", () => {
  const mockVector = createMockVector(0.05);

  const mockEmbeddingsClient: EmbeddingsClient = {
    embedQuery: async () => mockVector,
  };

  it("1. passes evaluation when actual retrieval returns chunks containing expected evidence", async () => {
    const mockRetrievedChunks: DocumentChunkWithDistanceRecord[] = [
      {
        id: "chunk-1",
        document_id: TEST_DOC_UUID,
        chunk_index: 0,
        content:
          "Jane Doe is a Lead Engineer with 10 years experience in distributed systems and Node.js.",
        metadata: { section: "experience" },
        embedding: mockVector,
        distance: 0.05,
        created_at: new Date(),
      },
      {
        id: "chunk-2",
        document_id: TEST_DOC_UUID,
        chunk_index: 1,
        content: "Designed high-throughput PostgreSQL databases with Redis caching.",
        metadata: { section: "experience" },
        embedding: mockVector,
        distance: 0.08,
        created_at: new Date(),
      },
    ];

    const mockRetrieveChunks = async (_params: RetrieveChunksParams) => {
      return mockRetrievedChunks;
    };

    const evaluationCase: RetrievalEvaluationCase = {
      name: "distributed-systems-eval",
      query: "Does the candidate have distributed systems and Node.js experience?",
      expectedTerms: ["distributed systems", "Node.js"],
    };

    const retrievedChunks = await orchestrateRagRetrieval(
      {
        query: evaluationCase.query,
        documentId: TEST_DOC_UUID,
      },
      {
        embeddingsClient: mockEmbeddingsClient,
        retrieveChunks: mockRetrieveChunks,
      },
    );

    const evalResult = evaluateRetrieval(evaluationCase, retrievedChunks);

    assert.equal(evalResult.passed, true);
    assert.deepEqual(evalResult.matchedTerms, ["distributed systems", "Node.js"]);
    assert.deepEqual(evalResult.missingTerms, []);
  });

  it("2. reports missing terms when retrieval returns chunks lacking the expected evidence or returns empty", async () => {
    const mockRetrievedChunks: DocumentChunkWithDistanceRecord[] = [
      {
        id: "chunk-1",
        document_id: TEST_DOC_UUID,
        chunk_index: 0,
        content:
          "Jane Doe is a Lead Engineer with 10 years experience in distributed systems and Node.js.",
        metadata: { section: "experience" },
        embedding: mockVector,
        distance: 0.05,
        created_at: new Date(),
      },
    ];

    const mockRetrieveChunks = async (_params: RetrieveChunksParams) => {
      return mockRetrievedChunks;
    };

    const evaluationCase: RetrievalEvaluationCase = {
      name: "kubernetes-skill-eval",
      query: "Does the candidate have Kubernetes container orchestration experience?",
      expectedTerms: ["Kubernetes"],
    };

    const retrievedChunks = await orchestrateRagRetrieval(
      {
        query: evaluationCase.query,
        documentId: TEST_DOC_UUID,
      },
      {
        embeddingsClient: mockEmbeddingsClient,
        retrieveChunks: mockRetrieveChunks,
      },
    );

    const evalResult = evaluateRetrieval(evaluationCase, retrievedChunks);

    assert.equal(evalResult.passed, false);
    assert.deepEqual(evalResult.matchedTerms, []);
    assert.deepEqual(evalResult.missingTerms, ["Kubernetes"]);
  });
});
