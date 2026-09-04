import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  limitContextChunks,
  formatContextString,
  DEFAULT_MAX_CONTEXT_CHARACTERS,
} from "../../src/utils/context-limiter.util.js";
import type { DocumentChunkWithDistanceRecord } from "../../src/types/document.types.js";

function createChunk(
  id: string,
  index: number,
  content: string,
  distance = 0.1,
): DocumentChunkWithDistanceRecord {
  return {
    id,
    document_id: "doc-123",
    chunk_index: index,
    content,
    metadata: { chunk_index: index },
    embedding: null,
    distance,
    created_at: new Date(),
  };
}

describe("RAG Context Limiter Unit Tests (Phase 12 — Block 3)", () => {
  it("1. Context below the limit: includes all chunks without truncation", () => {
    const chunk1 = createChunk("c1", 0, "First chunk of text (26 chars).", 0.05);
    const chunk2 = createChunk("c2", 1, "Second chunk of text (27 chars).", 0.12);

    const result = limitContextChunks([chunk1, chunk2], { maxCharacters: 100 });

    assert.equal(result.isTruncated, false);
    assert.equal(result.chunks.length, 2);
    assert.equal(result.chunks[0].id, "c1");
    assert.equal(result.chunks[1].id, "c2");
    assert.equal(result.totalCharacters, chunk1.content.length + chunk2.content.length);
  });

  it("2. Context exactly at the limit: includes all chunks and reports isTruncated as false", () => {
    const chunk1 = createChunk("c1", 0, "12345"); // 5 chars
    const chunk2 = createChunk("c2", 1, "67890"); // 5 chars

    const result = limitContextChunks([chunk1, chunk2], { maxCharacters: 10 });

    assert.equal(result.isTruncated, false);
    assert.equal(result.chunks.length, 2);
    assert.equal(result.totalCharacters, 10);
    assert.equal(result.chunks[0].content, "12345");
    assert.equal(result.chunks[1].content, "67890");
  });

  it("3. Context exceeding the limit: preserves complete most relevant chunks in order and halts before exceeding", () => {
    const chunk1 = createChunk("c1", 0, "Alpha content.", 0.02); // 14 chars
    const chunk2 = createChunk("c2", 1, "Beta content.", 0.08); // 13 chars
    const chunk3 = createChunk("c3", 2, "Gamma content.", 0.15); // 14 chars

    // Budget: 30 chars -> chunk1 (14) + chunk2 (13) = 27 chars. chunk3 (14) would make 41 > 30.
    const result = limitContextChunks([chunk1, chunk2, chunk3], { maxCharacters: 30 });

    assert.equal(result.isTruncated, true);
    assert.equal(result.chunks.length, 2);
    assert.equal(result.chunks[0].id, "c1");
    assert.equal(result.chunks[1].id, "c2");
    assert.equal(result.totalCharacters, 27);
  });

  it("4. Preservation of retrieval order: strictly preserves relevance ordering and never reorders", () => {
    const chunk1 = createChunk("most-relevant", 0, "Top relevance content.", 0.01);
    const chunk2 = createChunk("medium-relevant", 1, "Medium relevance content.", 0.05);
    const chunk3 = createChunk("low-relevant", 2, "Lower relevance content.", 0.2);

    const result = limitContextChunks([chunk1, chunk2, chunk3], { maxCharacters: 50 });

    assert.equal(result.chunks[0].id, "most-relevant");
    assert.equal(result.chunks[1].id, "medium-relevant");
  });

  it("5. Empty context: returns empty result with totalCharacters = 0 and isTruncated = false", () => {
    const result = limitContextChunks([]);

    assert.equal(result.isTruncated, false);
    assert.equal(result.chunks.length, 0);
    assert.equal(result.totalCharacters, 0);
  });

  it("6. Single oversized first chunk: deterministically truncates the top chunk to maxCharacters", () => {
    const hugeChunk = createChunk("c1", 0, "1234567890ABCDEF", 0.03); // 16 chars

    const result = limitContextChunks([hugeChunk], { maxCharacters: 10 });

    assert.equal(result.isTruncated, true);
    assert.equal(result.chunks.length, 1);
    assert.equal(result.chunks[0].id, "c1");
    assert.equal(result.chunks[0].content, "1234567890");
    assert.equal(result.totalCharacters, 10);
  });

  it("7. Default configuration: uses DEFAULT_MAX_CONTEXT_CHARACTERS (4000) when options are omitted", () => {
    const chunk = createChunk("c1", 0, "A".repeat(500));
    const result = limitContextChunks([chunk]);

    assert.equal(result.isTruncated, false);
    assert.equal(result.chunks.length, 1);
    assert.equal(result.totalCharacters, 500);
    assert.equal(DEFAULT_MAX_CONTEXT_CHARACTERS, 4000);
  });

  it("8. Invalid input validation: rejects non-array chunks or invalid limit values", () => {
    assert.throws(() => limitContextChunks(null as unknown as DocumentChunkWithDistanceRecord[]), {
      name: "TypeError",
      message: /Chunks must be an array/,
    });

    assert.throws(() => limitContextChunks([], { maxCharacters: 0 }), {
      name: "RangeError",
      message: /maxCharacters must be a positive integer/,
    });

    assert.throws(() => limitContextChunks([], { maxCharacters: -10 }), {
      name: "RangeError",
      message: /maxCharacters must be a positive integer/,
    });

    assert.throws(() => limitContextChunks([], { maxCharacters: 3.5 }), {
      name: "RangeError",
      message: /maxCharacters must be a positive integer/,
    });

    assert.throws(() => limitContextChunks([], { maxCharacters: NaN }), {
      name: "RangeError",
      message: /maxCharacters must be a positive integer/,
    });
  });

  it("9. formatContextString: joins chunks with delimiter and handles empty input", () => {
    const chunks = [{ content: "First paragraph" }, { content: "Second paragraph" }];

    const formatted = formatContextString(chunks, "\n\n---\n\n");
    assert.equal(formatted, "First paragraph\n\n---\n\nSecond paragraph");

    assert.equal(formatContextString([]), "");
  });
});
