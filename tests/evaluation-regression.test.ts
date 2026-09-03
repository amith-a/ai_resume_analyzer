import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { evaluateRetrieval } from "../src/services/retrieval-evaluation.service.js";
import { evaluateAnswer } from "../src/services/answer-evaluation.service.js";
import { checkGrounding } from "../src/services/grounding-check.service.js";
import {
  goldenRetrievalCases,
  goldenAnswerCases,
  CANONICAL_CHUNKS,
} from "./fixtures/golden-evaluation-cases.js";

describe("Evaluation & Grounding Regression Suite (Phase 13 — Block 7)", () => {
  describe("1. Retrieval Evaluation Regression", () => {
    for (const goldenCase of goldenRetrievalCases) {
      it(`guards ${goldenCase.name}`, () => {
        const result = evaluateRetrieval(goldenCase, goldenCase.retrievedChunks);

        assert.equal(
          result.passed,
          goldenCase.expectedPassed,
          `Retrieval regression failed: ${goldenCase.name} — expected passed to be ${goldenCase.expectedPassed} but got ${result.passed}`,
        );

        if (goldenCase.expectedPassed) {
          assert.equal(
            result.missingTerms.length,
            0,
            `Retrieval regression failed: ${goldenCase.name} — unexpected missing terms: ${result.missingTerms.join(", ")}`,
          );
          assert.deepEqual(
            result.matchedTerms,
            goldenCase.expectedTerms,
            `Retrieval regression failed: ${goldenCase.name} — matched terms divergence`,
          );
        } else {
          assert.ok(
            result.missingTerms.length > 0,
            `Retrieval regression failed: ${goldenCase.name} — expected missing terms to be reported`,
          );
        }
      });
    }
  });

  describe("2. Answer Evaluation Regression", () => {
    for (const goldenCase of goldenAnswerCases) {
      it(`guards ${goldenCase.name}`, () => {
        const result = evaluateAnswer(goldenCase);

        assert.equal(
          result.passed,
          goldenCase.expectedPassed,
          `Answer regression failed: ${goldenCase.name} — expected passed to be ${goldenCase.expectedPassed} but got ${result.passed} (overlapRatio: ${result.overlapRatio})`,
        );

        if (goldenCase.expectedPassed) {
          assert.ok(
            result.overlapRatio >= 0.5,
            `Answer regression failed: ${goldenCase.name} — expected overlapRatio >= 0.5, got ${result.overlapRatio}`,
          );
        } else {
          assert.ok(
            result.overlapRatio < 0.5,
            `Answer regression failed: ${goldenCase.name} — expected overlapRatio < 0.5, got ${result.overlapRatio}`,
          );
        }
      });
    }
  });

  describe("3. Runtime Grounding Check Regression", () => {
    it("guards supported-staff-engineer-answer", () => {
      const caseName = "supported-staff-engineer-answer";
      const result = checkGrounding({
        answer:
          "Jane Doe is a Staff Engineer at Acme Corp with experience in TypeScript and Node.js.",
        context: CANONICAL_CHUNKS.acmeCorp.content,
      });

      assert.equal(
        result.grounded,
        true,
        `Grounding regression failed: ${caseName} — expected grounded to be true`,
      );
      assert.ok(
        result.overlapRatio >= 0.5,
        `Grounding regression failed: ${caseName} — expected overlapRatio >= 0.5, got ${result.overlapRatio}`,
      );
    });

    it("guards unsupported-python-django-answer", () => {
      const caseName = "unsupported-python-django-answer";
      const result = checkGrounding({
        answer: "Candidate has extensive experience in Python, Django, Ruby on Rails, and PHP.",
        context: CANONICAL_CHUNKS.acmeCorp.content,
      });

      assert.equal(
        result.grounded,
        false,
        `Grounding regression failed: ${caseName} — expected grounded to be false`,
      );
      assert.ok(
        result.overlapRatio < 0.5,
        `Grounding regression failed: ${caseName} — expected overlapRatio < 0.5, got ${result.overlapRatio}`,
      );
    });

    it("guards empty-context-fallback", () => {
      const caseName = "empty-context-fallback";
      const result = checkGrounding({
        answer: "Candidate worked at Acme Corp.",
        context: "",
      });

      assert.equal(
        result.grounded,
        false,
        `Grounding regression failed: ${caseName} — expected grounded to be false`,
      );
      assert.equal(
        result.overlapRatio,
        0,
        `Grounding regression failed: ${caseName} — expected overlapRatio to be 0, got ${result.overlapRatio}`,
      );
    });

    it("guards technical-terms-preservation", () => {
      const caseName = "technical-terms-preservation";
      const combinedContext = `${CANONICAL_CHUNKS.acmeCorp.content}\n\n${CANONICAL_CHUNKS.betaTech.content}`;

      const result = checkGrounding({
        answer: "Experienced with Node.js, PostgreSQL, Kafka, AWS, and Kubernetes.",
        context: combinedContext,
      });

      assert.equal(
        result.grounded,
        true,
        `Grounding regression failed: ${caseName} — expected grounded to be true`,
      );
      assert.ok(
        result.overlapRatio >= 0.5,
        `Grounding regression failed: ${caseName} — expected overlapRatio >= 0.5, got ${result.overlapRatio}`,
      );
    });
  });
});
