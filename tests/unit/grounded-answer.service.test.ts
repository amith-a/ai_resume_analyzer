import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  produceGroundedAnswer,
  GROUNDING_FALLBACK_TEXT,
} from "../../src/services/grounded-answer.service.js";

describe("Grounded Answer Service Unit Tests (Phase 12 — Block 6)", () => {
  it("1. Non-empty answer with context: returns the LLM answer", () => {
    const result = produceGroundedAnswer({
      answer: "The candidate holds a Master's degree in Computer Science.",
      hasUsableContext: true,
    });

    assert.equal(result.answer, "The candidate holds a Master's degree in Computer Science.");
  });

  it("2. Trims surrounding whitespace from answer", () => {
    const result = produceGroundedAnswer({
      answer: "   \n\tThe candidate has 5 years experience.\n\n  ",
      hasUsableContext: true,
    });

    assert.equal(result.answer, "The candidate has 5 years experience.");
  });

  it("3. No context: returns grounding fallback text", () => {
    const result = produceGroundedAnswer({
      answer: "Fabricated answer without context evidence.",
      hasUsableContext: false,
    });

    assert.equal(result.answer, GROUNDING_FALLBACK_TEXT);
    assert.equal(result.answer, "The information is not available in the provided resume context.");
  });

  it("4. Empty answer with context: returns grounding fallback text", () => {
    const result = produceGroundedAnswer({
      answer: "",
      hasUsableContext: true,
    });

    assert.equal(result.answer, GROUNDING_FALLBACK_TEXT);
  });

  it("5. Whitespace-only answer with context: returns grounding fallback text", () => {
    const result = produceGroundedAnswer({
      answer: "   \n\t  ",
      hasUsableContext: true,
    });

    assert.equal(result.answer, GROUNDING_FALLBACK_TEXT);
  });

  it("6. Deterministic output: produces identical results across multiple invocations", () => {
    const input = {
      answer: "Deterministic candidate qualifications.",
      hasUsableContext: true,
    };

    const run1 = produceGroundedAnswer(input);
    const run2 = produceGroundedAnswer(input);

    assert.equal(run1.answer, run2.answer);
  });

  it("7. Input validation: rejects invalid argument types with TypeError", () => {
    assert.throws(
      () => produceGroundedAnswer(null as unknown as { answer: string; hasUsableContext: boolean }),
      { name: "TypeError", message: /params must be an object/ },
    );

    assert.throws(
      () => produceGroundedAnswer({ answer: 123 as unknown as string, hasUsableContext: true }),
      { name: "TypeError", message: /answer must be a string/ },
    );

    assert.throws(
      () =>
        produceGroundedAnswer({ answer: "valid", hasUsableContext: "true" as unknown as boolean }),
      { name: "TypeError", message: /hasUsableContext must be a boolean/ },
    );
  });
});
