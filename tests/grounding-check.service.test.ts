import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkGrounding } from "../src/services/grounding-check.service.js";

describe("Grounding Check Service Unit Tests (Phase 13 — Block 3)", () => {
  const sampleContext = `
[Source 1]
Jane Doe is a Senior Backend Engineer with 8 years of experience building distributed systems in Node.js and TypeScript.

[Source 2]
Designed and implemented high-throughput PostgreSQL databases with Redis caching and Docker orchestration.
`.trim();

  it("1. returns grounded: true when answer is supported by context", () => {
    const answer =
      "Jane Doe is a Senior Backend Engineer with experience in Node.js, TypeScript, and PostgreSQL.";
    const result = checkGrounding({ answer, context: sampleContext });

    assert.equal(result.grounded, true);
    assert.ok(result.overlapRatio >= 0.5, `Expected >= 0.5, got ${result.overlapRatio}`);
  });

  it("2. returns grounded: false and overlapRatio: 0 for empty answer", () => {
    const result = checkGrounding({ answer: "", context: sampleContext });

    assert.equal(result.grounded, false);
    assert.equal(result.overlapRatio, 0);
  });

  it("3. returns grounded: false and overlapRatio: 0 for whitespace-only answer", () => {
    const result = checkGrounding({ answer: "   \n\t  ", context: sampleContext });

    assert.equal(result.grounded, false);
    assert.equal(result.overlapRatio, 0);
  });

  it("4. returns grounded: false and overlapRatio: 0 for empty context", () => {
    const result = checkGrounding({
      answer: "Jane Doe is a Senior Backend Engineer",
      context: "",
    });

    assert.equal(result.grounded, false);
    assert.equal(result.overlapRatio, 0);
  });

  it("5. returns grounded: false and overlapRatio: 0 for whitespace-only context", () => {
    const result = checkGrounding({
      answer: "Jane Doe is a Senior Backend Engineer",
      context: "   \n\t  ",
    });

    assert.equal(result.grounded, false);
    assert.equal(result.overlapRatio, 0);
  });

  it("6. returns grounded: false when answer is completely unrelated to context", () => {
    const answer =
      "The candidate specializes in Quantum Physics and aeronautical aerospace engineering with MATLAB.";
    const result = checkGrounding({ answer, context: sampleContext });

    assert.equal(result.grounded, false);
    assert.equal(result.overlapRatio, 0);
  });

  it("7. no substring bypass: answer containing verbatim context snippet diluted by unsupported claims fails closed", () => {
    const answer =
      "Jane Doe is an expert in quantum cryptography, blockchain architecture, compiler optimization, Rust, Assembly, FORTRAN, and COBOL.";
    const result = checkGrounding({ answer, context: sampleContext });

    assert.equal(
      result.grounded,
      false,
      "Answer must NOT be grounded merely because a substring ('Jane Doe') exists in context",
    );
    assert.ok(result.overlapRatio < 0.5);
  });

  it("8. performs case-insensitive token matching across answer and context", () => {
    const answer = "JANE DOE is a BACKEND ENGINEER with TYPESCRIPT and POSTGRESQL.";
    const result = checkGrounding({ answer, context: sampleContext });

    assert.equal(result.grounded, true);
    assert.ok(result.overlapRatio >= 0.5);
  });

  it("9. detects supported content distributed across multiple context chunks", () => {
    const answer = "Jane Doe has experience with TypeScript from Source 1 and Redis from Source 2.";
    const result = checkGrounding({ answer, context: sampleContext });

    assert.equal(result.grounded, true);
    assert.ok(result.overlapRatio >= 0.5);
  });

  it("10. preserves numbers and numeric facts as informative tokens", () => {
    const answer = "Candidate has 8 years of experience.";
    const result = checkGrounding({ answer, context: sampleContext });

    assert.equal(result.grounded, true);
    assert.ok(result.overlapRatio >= 0.5);
  });

  it("11. produces deterministic output for identical inputs", () => {
    const params = {
      answer: "Jane Doe has experience with Docker and PostgreSQL.",
      context: sampleContext,
    };

    const run1 = checkGrounding(params);
    const run2 = checkGrounding(params);

    assert.deepEqual(run1, run2);
  });

  it("12. rejects invalid input types with TypeError", () => {
    assert.throws(() => checkGrounding(null as unknown as { answer: string; context: string }), {
      name: "TypeError",
      message: /params must be an object/,
    });

    assert.throws(() => checkGrounding({ answer: 123 as unknown as string, context: "Context" }), {
      name: "TypeError",
      message: /answer must be a string/,
    });

    assert.throws(() => checkGrounding({ answer: "Answer", context: 123 as unknown as string }), {
      name: "TypeError",
      message: /context must be a string/,
    });
  });

  it("13. fails closed when answer contains only stop words (no informative tokens)", () => {
    const answer = "is a and the or to with for of by";
    const result = checkGrounding({ answer, context: sampleContext });

    assert.equal(result.grounded, false);
    assert.equal(result.overlapRatio, 0);
  });
});
