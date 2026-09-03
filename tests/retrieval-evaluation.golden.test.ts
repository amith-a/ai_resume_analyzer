import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { evaluateRetrieval } from "../src/services/retrieval-evaluation.service.js";
import { goldenRetrievalCases } from "./fixtures/golden-evaluation-cases.js";

describe("Retrieval Evaluation Golden Cases Suite (Phase 13 — Block 6)", () => {
  for (const goldenCase of goldenRetrievalCases) {
    it(`evaluates ${goldenCase.name} -> expectedPassed: ${goldenCase.expectedPassed}`, () => {
      const result = evaluateRetrieval(goldenCase, goldenCase.retrievedChunks);

      assert.equal(
        result.passed,
        goldenCase.expectedPassed,
        `Expected ${goldenCase.name} to pass: ${goldenCase.expectedPassed}, but received: ${result.passed}`,
      );

      if (goldenCase.expectedPassed) {
        assert.equal(
          result.missingTerms.length,
          0,
          `Expected no missing terms for passing case ${goldenCase.name}, got: ${result.missingTerms.join(", ")}`,
        );
        assert.deepEqual(result.matchedTerms, goldenCase.expectedTerms);
      } else {
        assert.ok(
          result.missingTerms.length > 0,
          `Expected missing terms for failing case ${goldenCase.name}, got none`,
        );
      }
    });
  }
});
