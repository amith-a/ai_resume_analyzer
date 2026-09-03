import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { constructContext } from "../src/utils/context-builder.util.js";
import type { DocumentChunkWithDistanceRecord } from "../src/types/document.types.js";

function createChunk(
  id: string,
  index: number,
  content: string,
  distance = 0.05,
): DocumentChunkWithDistanceRecord {
  return {
    id,
    document_id: "doc-uuid-123",
    chunk_index: index,
    content,
    metadata: { section: "experience" },
    embedding: null,
    distance,
    created_at: new Date(),
  };
}

describe("RAG Context Construction Unit Tests (Phase 12 — Block 2)", () => {
  it("1. Multiple retrieved chunks: formats each chunk under numbered [Source N] header", () => {
    const chunk1 = createChunk(
      "c1",
      0,
      "Lead engineer building distributed systems with TypeScript.",
    );
    const chunk2 = createChunk("c2", 1, "Designed high-throughput PostgreSQL schemas and indexes.");

    const result = constructContext([chunk1, chunk2]);

    const expected =
      "[Source 1]\nLead engineer building distributed systems with TypeScript.\n\n" +
      "[Source 2]\nDesigned high-throughput PostgreSQL schemas and indexes.";

    assert.equal(result, expected);
  });

  it("2. Preservation of retrieval order: preserves exact order of input chunks without reordering", () => {
    const chunk1 = createChunk("top-match", 0, "Top matching chunk content.", 0.02);
    const chunk2 = createChunk("second-match", 1, "Second matching chunk content.", 0.09);
    const chunk3 = createChunk("third-match", 2, "Third matching chunk content.", 0.15);

    const result = constructContext([chunk1, chunk2, chunk3]);

    assert.ok(result.startsWith("[Source 1]\nTop matching chunk content."));
    assert.ok(result.includes("[Source 2]\nSecond matching chunk content."));
    assert.ok(result.endsWith("[Source 3]\nThird matching chunk content."));
  });

  it("3. Correct chunk separation: separates multiple sources with double newlines", () => {
    const chunk1 = createChunk("c1", 0, "Content A");
    const chunk2 = createChunk("c2", 1, "Content B");

    const result = constructContext([chunk1, chunk2]);

    assert.equal(result, "[Source 1]\nContent A\n\n[Source 2]\nContent B");
  });

  it("4. Deterministic output: produces identical output for identical inputs across multiple runs", () => {
    const chunks = [
      createChunk("c1", 0, "Deterministic chunk 1"),
      createChunk("c2", 1, "Deterministic chunk 2"),
    ];

    const run1 = constructContext(chunks);
    const run2 = constructContext(chunks);
    const run3 = constructContext(chunks);

    assert.equal(run1, run2);
    assert.equal(run2, run3);
  });

  it("5. Empty input: returns empty string when chunk array is empty", () => {
    const result = constructContext([]);
    assert.equal(result, "");
  });

  it("6. Normal chunk content: trims inner trailing/leading whitespace cleanly", () => {
    const chunk = createChunk("c1", 0, "   Cleanly trimmed paragraph content.   \n\n");
    const result = constructContext([chunk]);

    assert.equal(result, "[Source 1]\nCleanly trimmed paragraph content.");
  });

  it("7. Single chunk: formats single source without trailing double newlines", () => {
    const chunk = createChunk("c1", 0, "Single chunk content.");
    const result = constructContext([chunk]);

    assert.equal(result, "[Source 1]\nSingle chunk content.");
  });
});
