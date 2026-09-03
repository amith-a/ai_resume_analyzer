import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  analyzeRetrievalFailure,
  analyzeAnswerFailure,
  analyzeGroundingFailure,
} from "../src/services/evaluation-failure-analysis.service.js";

describe("Evaluation Failure Analysis Service Unit Tests (Phase 13 — Block 8)", () => {
  describe("1. Retrieval Failure Analysis", () => {
    it("1. passing retrieval produces no failure", () => {
      const analysis = analyzeRetrievalFailure({
        result: {
          passed: true,
          matchedTerms: ["Node.js", "TypeScript"],
          missingTerms: [],
        },
        retrievedChunkCount: 2,
      });

      assert.equal(analysis.failed, false);
      assert.deepEqual(analysis.reasons, []);
    });

    it("2. failed retrieval with zero chunks produces no-retrieved-context", () => {
      const analysis = analyzeRetrievalFailure({
        result: {
          passed: false,
          matchedTerms: [],
          missingTerms: ["Node.js"],
        },
        retrievedChunkCount: 0,
      });

      assert.equal(analysis.failed, true);
      assert.ok(analysis.reasons.includes("no-retrieved-context"));
    });

    it("3. failed retrieval with missing terms produces expected-evidence-missing", () => {
      const analysis = analyzeRetrievalFailure({
        result: {
          passed: false,
          matchedTerms: ["Node.js"],
          missingTerms: ["Python"],
        },
        retrievedChunkCount: 1,
      });

      assert.equal(analysis.failed, true);
      assert.deepEqual(analysis.reasons, ["expected-evidence-missing"]);
    });

    it("4. failed retrieval with zero chunks and missing terms produces both reasons", () => {
      const analysis = analyzeRetrievalFailure({
        result: {
          passed: false,
          matchedTerms: [],
          missingTerms: ["Node.js"],
        },
        retrievedChunkCount: 0,
      });

      assert.equal(analysis.failed, true);
      assert.deepEqual(analysis.reasons, ["no-retrieved-context", "expected-evidence-missing"]);
    });

    it("5. maintains deterministic order of failure reasons", () => {
      const analysis = analyzeRetrievalFailure({
        result: {
          passed: false,
          matchedTerms: [],
          missingTerms: ["Node.js", "PostgreSQL"],
        },
        retrievedChunkCount: 0,
      });

      assert.equal(analysis.reasons[0], "no-retrieved-context");
      assert.equal(analysis.reasons[1], "expected-evidence-missing");
    });

    it("6. rejects invalid input with TypeError", () => {
      assert.throws(
        () =>
          analyzeRetrievalFailure(null as unknown as Parameters<typeof analyzeRetrievalFailure>[0]),
        {
          name: "TypeError",
          message: /input must be an object/,
        },
      );

      assert.throws(
        () =>
          analyzeRetrievalFailure({
            result: null as unknown as Parameters<typeof analyzeRetrievalFailure>[0]["result"],
            retrievedChunkCount: 1,
          }),
        {
          name: "TypeError",
          message: /input\.result must be a valid RetrievalEvaluationResult object/,
        },
      );

      assert.throws(
        () =>
          analyzeRetrievalFailure({
            result: { passed: true, matchedTerms: [], missingTerms: [] },
            retrievedChunkCount: -1,
          }),
        {
          name: "TypeError",
          message: /input\.retrievedChunkCount must be a non-negative integer/,
        },
      );
    });
  });

  describe("2. Answer Failure Analysis", () => {
    it("7. supported answer produces no failure", () => {
      const analysis = analyzeAnswerFailure({
        result: { passed: true, overlapRatio: 0.8 },
        answer: "Candidate has experience with Node.js.",
        context: "Jane Doe has experience with Node.js and TypeScript.",
      });

      assert.equal(analysis.failed, false);
      assert.deepEqual(analysis.reasons, []);
    });

    it("8. low-overlap answer produces low-answer-overlap", () => {
      const analysis = analyzeAnswerFailure({
        result: { passed: false, overlapRatio: 0.2 },
        answer: "Candidate has experience with Python, Django, and Ruby.",
        context: "Jane Doe has experience with Node.js and TypeScript.",
      });

      assert.equal(analysis.failed, true);
      assert.deepEqual(analysis.reasons, ["low-answer-overlap"]);
    });

    it("9. empty answer produces empty-answer", () => {
      const analysis = analyzeAnswerFailure({
        result: { passed: false, overlapRatio: 0 },
        answer: "   \n\t  ",
        context: "Jane Doe has experience with Node.js.",
      });

      assert.equal(analysis.failed, true);
      assert.deepEqual(analysis.reasons, ["empty-answer"]);
    });

    it("10. empty context produces empty-context", () => {
      const analysis = analyzeAnswerFailure({
        result: { passed: false, overlapRatio: 0 },
        answer: "Candidate has experience with Node.js.",
        context: "   \n\t  ",
      });

      assert.equal(analysis.failed, true);
      assert.deepEqual(analysis.reasons, ["empty-context"]);
    });

    it("11. empty answer and empty context produces both reasons in deterministic order", () => {
      const analysis = analyzeAnswerFailure({
        result: { passed: false, overlapRatio: 0 },
        answer: "",
        context: "",
      });

      assert.equal(analysis.failed, true);
      assert.deepEqual(analysis.reasons, ["empty-answer", "empty-context"]);
    });

    it("12. rejects invalid input with TypeError", () => {
      assert.throws(
        () => analyzeAnswerFailure(null as unknown as Parameters<typeof analyzeAnswerFailure>[0]),
        {
          name: "TypeError",
          message: /input must be an object/,
        },
      );

      assert.throws(
        () =>
          analyzeAnswerFailure({
            result: null as unknown as Parameters<typeof analyzeAnswerFailure>[0]["result"],
            answer: "Ans",
            context: "Ctx",
          }),
        {
          name: "TypeError",
          message: /input\.result must be a valid AnswerEvaluationResult object/,
        },
      );

      assert.throws(
        () =>
          analyzeAnswerFailure({
            result: { passed: true, overlapRatio: 0.8 },
            answer: 123 as unknown as string,
            context: "Ctx",
          }),
        {
          name: "TypeError",
          message: /input\.answer must be a string/,
        },
      );

      assert.throws(
        () =>
          analyzeAnswerFailure({
            result: { passed: true, overlapRatio: 0.8 },
            answer: "Ans",
            context: 123 as unknown as string,
          }),
        {
          name: "TypeError",
          message: /input\.context must be a string/,
        },
      );
    });
  });

  describe("3. Grounding Failure Analysis", () => {
    it("13. grounded answer produces no failure", () => {
      const analysis = analyzeGroundingFailure({
        result: { grounded: true, overlapRatio: 0.75 },
        answer: "Candidate has experience with Node.js.",
        context: "Jane Doe has experience with Node.js and TypeScript.",
      });

      assert.equal(analysis.failed, false);
      assert.deepEqual(analysis.reasons, []);
    });

    it("14. unsupported claim produces unsupported-claim", () => {
      const analysis = analyzeGroundingFailure({
        result: { grounded: false, overlapRatio: 0.2 },
        answer: "Candidate is a Python and Django expert.",
        context: "Jane Doe has experience with Node.js and TypeScript.",
      });

      assert.equal(analysis.failed, true);
      assert.deepEqual(analysis.reasons, ["unsupported-claim"]);
    });

    it("15. empty context produces empty-context without claiming unsupported-claim", () => {
      const analysis = analyzeGroundingFailure({
        result: { grounded: false, overlapRatio: 0 },
        answer: "Candidate has experience with Node.js.",
        context: "",
      });

      assert.equal(analysis.failed, true);
      assert.deepEqual(analysis.reasons, ["empty-context"]);
    });

    it("16. empty answer produces empty-answer", () => {
      const analysis = analyzeGroundingFailure({
        result: { grounded: false, overlapRatio: 0 },
        answer: "   ",
        context: "Jane Doe has experience with Node.js.",
      });

      assert.equal(analysis.failed, true);
      assert.deepEqual(analysis.reasons, ["empty-answer"]);
    });

    it("17. empty answer and empty context produces empty-answer and empty-context in deterministic order", () => {
      const analysis = analyzeGroundingFailure({
        result: { grounded: false, overlapRatio: 0 },
        answer: "",
        context: "",
      });

      assert.equal(analysis.failed, true);
      assert.deepEqual(analysis.reasons, ["empty-answer", "empty-context"]);
    });

    it("18. rejects invalid input with TypeError", () => {
      assert.throws(
        () =>
          analyzeGroundingFailure(null as unknown as Parameters<typeof analyzeGroundingFailure>[0]),
        {
          name: "TypeError",
          message: /input must be an object/,
        },
      );

      assert.throws(
        () =>
          analyzeGroundingFailure({
            result: null as unknown as Parameters<typeof analyzeGroundingFailure>[0]["result"],
            answer: "Ans",
            context: "Ctx",
          }),
        {
          name: "TypeError",
          message: /input\.result must be a valid GroundingCheckResult object/,
        },
      );

      assert.throws(
        () =>
          analyzeGroundingFailure({
            result: { grounded: true, overlapRatio: 0.8 },
            answer: 123 as unknown as string,
            context: "Ctx",
          }),
        {
          name: "TypeError",
          message: /input\.answer must be a string/,
        },
      );

      assert.throws(
        () =>
          analyzeGroundingFailure({
            result: { grounded: true, overlapRatio: 0.8 },
            answer: "Ans",
            context: 123 as unknown as string,
          }),
        {
          name: "TypeError",
          message: /input\.context must be a string/,
        },
      );
    });
  });
});
