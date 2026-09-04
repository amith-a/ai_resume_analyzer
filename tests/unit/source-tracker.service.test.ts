import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { trackSources } from "../../src/services/source-tracker.service.js";
import type {
  DocumentChunkRecord,
  DocumentChunkWithDistanceRecord,
} from "../../src/types/document.types.js";

function createChunk(
  id: string,
  index: number,
  docId = "doc-123",
): DocumentChunkWithDistanceRecord {
  return {
    id,
    document_id: docId,
    chunk_index: index,
    content: `Content for ${id}`,
    metadata: { section: "experience" },
    embedding: null,
    distance: 0.05,
    created_at: new Date(),
  };
}

describe("Source Tracking Service Unit Tests (Phase 12 — Block 7)", () => {
  it("1. Non-empty answer returns corresponding mapped sources", () => {
    const chunk1 = createChunk("chunk-uuid-1", 0, "doc-abc");
    const chunk2 = createChunk("chunk-uuid-2", 1, "doc-abc");

    const result = trackSources({
      answer: "The candidate has experience with PostgreSQL.",
      chunks: [chunk1, chunk2],
    });

    assert.equal(result.answer, "The candidate has experience with PostgreSQL.");
    assert.equal(result.sources.length, 2);
    assert.deepEqual(result.sources[0], {
      id: "chunk-uuid-1",
      chunkId: "chunk-uuid-1",
      chunkIndex: 0,
      documentId: "doc-abc",
      content: "Content for chunk-uuid-1",
    });
    assert.deepEqual(result.sources[1], {
      id: "chunk-uuid-2",
      chunkId: "chunk-uuid-2",
      chunkIndex: 1,
      documentId: "doc-abc",
      content: "Content for chunk-uuid-2",
    });
  });

  it("2. Source IDs and metadata are taken strictly from DocumentChunkRecord", () => {
    const standardChunk: DocumentChunkRecord = {
      id: "chunk-exact-99",
      document_id: "doc-exact-123",
      chunk_index: 5,
      content: "Exact chunk content",
      metadata: { key: "value" },
      embedding: null,
      created_at: new Date(),
    };

    const result = trackSources({
      answer: "Some answer",
      chunks: [standardChunk],
    });

    assert.equal(result.sources[0].id, "chunk-exact-99");
    assert.equal(result.sources[0].chunkId, "chunk-exact-99");
    assert.equal(result.sources[0].chunkIndex, 5);
    assert.equal(result.sources[0].documentId, "doc-exact-123");
    assert.equal(result.sources[0].content, "Exact chunk content");
  });

  it("3. Source order matches context input order strictly", () => {
    const chunkA = createChunk("chunk-A", 0);
    const chunkB = createChunk("chunk-B", 1);
    const chunkC = createChunk("chunk-C", 2);

    const result = trackSources({
      answer: "Ordered answer",
      chunks: [chunkA, chunkB, chunkC],
    });

    assert.equal(result.sources[0].id, "chunk-A");
    assert.equal(result.sources[1].id, "chunk-B");
    assert.equal(result.sources[2].id, "chunk-C");
  });

  it("4. Limited context produces only selected sources", () => {
    const allRetrieved = [
      createChunk("c1", 0),
      createChunk("c2", 1),
      createChunk("c3", 2),
      createChunk("c4", 3),
    ];

    // Simulating context limiter choosing only top 2 chunks
    const selectedByLimiter = allRetrieved.slice(0, 2);

    const result = trackSources({
      answer: "Answer based on top 2 chunks",
      chunks: selectedByLimiter,
    });

    assert.equal(result.sources.length, 2);
    assert.equal(result.sources[0].id, "c1");
    assert.equal(result.sources[1].id, "c2");
  });

  it("5. Empty context produces sources: []", () => {
    const result = trackSources({
      answer: "The information is not available in the provided resume context.",
      chunks: [],
    });

    assert.equal(result.answer, "The information is not available in the provided resume context.");
    assert.deepEqual(result.sources, []);
  });

  it("6. Empty answer does not fabricate sources", () => {
    const result = trackSources({
      answer: "",
      chunks: [],
    });

    assert.equal(result.answer, "");
    assert.deepEqual(result.sources, []);
  });

  it("7. Deterministic output: produces identical source lists for identical inputs", () => {
    const chunks = [createChunk("c1", 0), createChunk("c2", 1)];
    const input = { answer: "Deterministic test", chunks };

    const run1 = trackSources(input);
    const run2 = trackSources(input);

    assert.deepEqual(run1, run2);
  });

  it("8. Input validation: rejects invalid input types with TypeError", () => {
    assert.throws(() => trackSources(null as unknown as { answer: string; chunks: [] }), {
      name: "TypeError",
      message: /params must be an object/,
    });

    assert.throws(() => trackSources({ answer: 123 as unknown as string, chunks: [] }), {
      name: "TypeError",
      message: /answer must be a string/,
    });

    assert.throws(() => trackSources({ answer: "Valid", chunks: null as unknown as [] }), {
      name: "TypeError",
      message: /chunks must be an array/,
    });

    const validBaseChunk: DocumentChunkRecord = {
      id: "chunk-valid-1",
      document_id: "doc-valid-1",
      chunk_index: 0,
      content: "Valid chunk content",
      metadata: {},
      embedding: null,
      created_at: new Date(),
    };

    assert.throws(() => trackSources({ answer: "Valid", chunks: [{}] as unknown as [] }), {
      name: "TypeError",
      message: /Each chunk must be a valid chunk record/,
    });

    assert.throws(
      () => trackSources({ answer: "Valid", chunks: [null as unknown as DocumentChunkRecord] }),
      {
        name: "TypeError",
        message: /Each chunk must be a valid chunk record/,
      },
    );

    assert.throws(
      () =>
        trackSources({
          answer: "Valid",
          chunks: [{ ...validBaseChunk, id: 123 as unknown as string }],
        }),
      {
        name: "TypeError",
        message: /Each chunk must be a valid chunk record/,
      },
    );

    assert.throws(
      () =>
        trackSources({
          answer: "Valid",
          chunks: [{ ...validBaseChunk, document_id: 456 as unknown as string }],
        }),
      {
        name: "TypeError",
        message: /Each chunk must be a valid chunk record/,
      },
    );

    assert.throws(
      () =>
        trackSources({
          answer: "Valid",
          chunks: [{ ...validBaseChunk, chunk_index: "zero" as unknown as number }],
        }),
      {
        name: "TypeError",
        message: /Each chunk must be a valid chunk record/,
      },
    );

    assert.throws(
      () =>
        trackSources({
          answer: "Valid",
          chunks: [{ ...validBaseChunk, content: null as unknown as string }],
        }),
      {
        name: "TypeError",
        message: /Each chunk must be a valid chunk record/,
      },
    );
  });
});
