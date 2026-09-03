import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateRetrieval,
  type RetrievalEvaluationCase,
  type RetrievalChunkInput,
} from "../src/services/retrieval-evaluation.service.js";

describe("Retrieval Evaluation Service Unit Tests (Phase 13 — Block 4)", () => {
  const sampleChunks: RetrievalChunkInput[] = [
    {
      content:
        "Jane Doe is a Senior Backend Engineer with 8 years of experience building distributed systems in Node.js and TypeScript.",
    },
    {
      content:
        "Designed and maintained high-throughput PostgreSQL databases with Redis caching and AWS EC2 deployments.",
    },
  ];

  it("1. passes when all expected terms are present in retrieved chunks", () => {
    const evaluationCase: RetrievalEvaluationCase = {
      name: "node-typescript-eval",
      query: "What backend technologies does the candidate use?",
      expectedTerms: ["Node.js", "TypeScript", "PostgreSQL"],
    };

    const result = evaluateRetrieval(evaluationCase, sampleChunks);

    assert.equal(result.passed, true);
    assert.deepEqual(result.matchedTerms, ["Node.js", "TypeScript", "PostgreSQL"]);
    assert.deepEqual(result.missingTerms, []);
  });

  it("2. fails when one expected term is missing from retrieved chunks", () => {
    const evaluationCase: RetrievalEvaluationCase = {
      name: "node-python-eval",
      query: "Does the candidate know Node.js and Python?",
      expectedTerms: ["Node.js", "Python"],
    };

    const result = evaluateRetrieval(evaluationCase, sampleChunks);

    assert.equal(result.passed, false);
    assert.deepEqual(result.matchedTerms, ["Node.js"]);
    assert.deepEqual(result.missingTerms, ["Python"]);
  });

  it("3. fails when multiple expected terms are missing from retrieved chunks", () => {
    const evaluationCase: RetrievalEvaluationCase = {
      name: "python-kubernetes-eval",
      query: "Does the candidate have Python and Kubernetes experience?",
      expectedTerms: ["Python", "Kubernetes", "Golang"],
    };

    const result = evaluateRetrieval(evaluationCase, sampleChunks);

    assert.equal(result.passed, false);
    assert.deepEqual(result.matchedTerms, []);
    assert.deepEqual(result.missingTerms, ["Python", "Kubernetes", "Golang"]);
  });

  it("4. performs case-insensitive matching between expected terms and chunk content", () => {
    const evaluationCase: RetrievalEvaluationCase = {
      name: "case-insensitivity-eval",
      query: "Check database and cloud skills",
      expectedTerms: ["POSTGRESQL", "aws", "redis"],
    };

    const result = evaluateRetrieval(evaluationCase, sampleChunks);

    assert.equal(result.passed, true);
    assert.deepEqual(result.matchedTerms, ["POSTGRESQL", "aws", "redis"]);
    assert.deepEqual(result.missingTerms, []);
  });

  it("5. normalizes surrounding whitespace and punctuation in terms and chunk content", () => {
    const evaluationCase: RetrievalEvaluationCase = {
      name: "whitespace-eval",
      query: "Check trimmed terms",
      expectedTerms: ["  TypeScript  ", "PostgreSQL."],
    };

    const result = evaluateRetrieval(evaluationCase, sampleChunks);

    assert.equal(result.passed, true);
    assert.deepEqual(result.matchedTerms, ["  TypeScript  ", "PostgreSQL."]);
    assert.deepEqual(result.missingTerms, []);
  });

  it("6. evaluates multi-word phrases using contiguous token matching", () => {
    const evaluationCase: RetrievalEvaluationCase = {
      name: "phrase-eval",
      query: "Architecture experience",
      expectedTerms: ["distributed systems", "Senior Backend Engineer"],
    };

    const result = evaluateRetrieval(evaluationCase, sampleChunks);

    assert.equal(result.passed, true);
    assert.deepEqual(result.matchedTerms, ["distributed systems", "Senior Backend Engineer"]);
    assert.deepEqual(result.missingTerms, []);
  });

  it("7. avoids false-positive substring matching (e.g. 'aws' does not match 'flaws')", () => {
    const chunksWithFlaws: RetrievalChunkInput[] = [
      {
        content: "Identified several major security flaws in legacy code and resolved them.",
      },
    ];

    const evaluationCase: RetrievalEvaluationCase = {
      name: "substring-false-positive-eval",
      query: "Does the candidate have AWS cloud experience?",
      expectedTerms: ["aws"],
    };

    const result = evaluateRetrieval(evaluationCase, chunksWithFlaws);

    assert.equal(
      result.passed,
      false,
      "Expected term 'aws' must not match as a substring inside 'flaws'",
    );
    assert.deepEqual(result.matchedTerms, []);
    assert.deepEqual(result.missingTerms, ["aws"]);
  });

  it("8. fails closed and marks all expected terms missing when no chunks are retrieved", () => {
    const evaluationCase: RetrievalEvaluationCase = {
      name: "empty-chunks-eval",
      query: "What is Jane's experience?",
      expectedTerms: ["Node.js", "PostgreSQL"],
    };

    const result = evaluateRetrieval(evaluationCase, []);

    assert.equal(result.passed, false);
    assert.deepEqual(result.matchedTerms, []);
    assert.deepEqual(result.missingTerms, ["Node.js", "PostgreSQL"]);
  });

  it("9. fails closed when expectedTerms is empty", () => {
    const evaluationCase: RetrievalEvaluationCase = {
      name: "empty-expected-eval",
      query: "Empty expected query",
      expectedTerms: [],
    };

    const result = evaluateRetrieval(evaluationCase, sampleChunks);

    assert.equal(result.passed, false);
    assert.deepEqual(result.matchedTerms, []);
    assert.deepEqual(result.missingTerms, []);
  });

  it("10. rejects invalid evaluation case input with TypeError", () => {
    assert.throws(
      () => evaluateRetrieval(null as unknown as RetrievalEvaluationCase, sampleChunks),
      { name: "TypeError", message: /evaluationCase must be an object/ },
    );

    assert.throws(
      () =>
        evaluateRetrieval(
          { name: "", query: "Query", expectedTerms: ["node"] },
          sampleChunks,
        ),
      { name: "TypeError", message: /evaluationCase\.name must be a non-empty string/ },
    );

    assert.throws(
      () =>
        evaluateRetrieval(
          { name: "name", query: "", expectedTerms: ["node"] },
          sampleChunks,
        ),
      { name: "TypeError", message: /evaluationCase\.query must be a non-empty string/ },
    );

    assert.throws(
      () =>
        evaluateRetrieval(
          { name: "name", query: "query", expectedTerms: "invalid" as unknown as string[] },
          sampleChunks,
        ),
      { name: "TypeError", message: /expectedTerms must be an array/ },
    );

    assert.throws(
      () =>
        evaluateRetrieval(
          { name: "name", query: "query", expectedTerms: [123 as unknown as string] },
          sampleChunks,
        ),
      { name: "TypeError", message: /expectedTerms must be an array/ },
    );
  });

  it("11. rejects invalid retrieved chunks with TypeError", () => {
    const evaluationCase: RetrievalEvaluationCase = {
      name: "validation-eval",
      query: "Some query",
      expectedTerms: ["Node.js"],
    };

    assert.throws(
      () =>
        evaluateRetrieval(
          evaluationCase,
          null as unknown as RetrievalChunkInput[],
        ),
      { name: "TypeError", message: /retrievedChunks must be an array/ },
    );

    assert.throws(
      () =>
        evaluateRetrieval(evaluationCase, [
          { content: 123 as unknown as string },
        ]),
      { name: "TypeError", message: /retrievedChunks must be an array/ },
    );
  });

  it("12. produces deterministic output for identical inputs", () => {
    const evaluationCase: RetrievalEvaluationCase = {
      name: "deterministic-eval",
      query: "Skills query",
      expectedTerms: ["Node.js", "Docker", "Python"],
    };

    const run1 = evaluateRetrieval(evaluationCase, sampleChunks);
    const run2 = evaluateRetrieval(evaluationCase, sampleChunks);

    assert.deepEqual(run1, run2);
  });

  it("13. evaluates only retrieved chunk content (terms outside retrieved chunks are reported missing)", () => {
    // Only pass chunk 1 (contains Node.js and TypeScript, but NOT AWS or EC2)
    const singleChunk = [sampleChunks[0]];

    const evaluationCase: RetrievalEvaluationCase = {
      name: "chunk-boundary-eval",
      query: "Check AWS skills",
      expectedTerms: ["Node.js", "AWS"],
    };

    const result = evaluateRetrieval(evaluationCase, singleChunk);

    assert.equal(result.passed, false);
    assert.deepEqual(result.matchedTerms, ["Node.js"]);
    assert.deepEqual(result.missingTerms, ["AWS"]);
  });
});
