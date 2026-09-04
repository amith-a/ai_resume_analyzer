import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { evaluateAnswer } from "../../src/services/answer-evaluation.service.js";
import { goldenAnswerCases } from "../fixtures/golden-evaluation-cases.js";

describe("Answer Evaluation Golden Cases Suite (Phase 13 — Block 6)", () => {
  for (const goldenCase of goldenAnswerCases) {
    it(`evaluates ${goldenCase.name} -> expectedPassed: ${goldenCase.expectedPassed}`, () => {
      const result = evaluateAnswer(goldenCase);

      assert.equal(
        result.passed,
        goldenCase.expectedPassed,
        `Expected ${goldenCase.name} to pass: ${goldenCase.expectedPassed}, but received: ${result.passed} (overlapRatio: ${result.overlapRatio})`,
      );

      if (goldenCase.expectedPassed) {
        assert.ok(
          result.overlapRatio >= 0.5,
          `Expected overlapRatio >= 0.5 for passing case ${goldenCase.name}, got ${result.overlapRatio}`,
        );
      } else {
        assert.ok(
          result.overlapRatio < 0.5,
          `Expected overlapRatio < 0.5 for failing case ${goldenCase.name}, got ${result.overlapRatio}`,
        );
      }
    });
  }
});
