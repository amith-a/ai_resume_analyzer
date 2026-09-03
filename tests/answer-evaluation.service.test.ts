import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateAnswer,
  type AnswerEvaluationCase,
} from "../src/services/answer-evaluation.service.js";

describe("Answer Evaluation Service Unit Tests (Phase 13 — Block 5)", () => {
  it("1. passes when answer is supported by context", () => {
    const evaluationCase: AnswerEvaluationCase = {
      name: "supported-answer-test",
      context: "The candidate has 8 years of experience with Node.js and TypeScript.",
      answer: "The candidate has experience with Node.js and TypeScript.",
    };

    const result = evaluateAnswer(evaluationCase);

    assert.equal(result.passed, true);
    assert.ok(result.overlapRatio >= 0.5, `Expected >= 0.5, got ${result.overlapRatio}`);
  });

  it("2. fails when answer is mostly unsupported by context", () => {
    const evaluationCase: AnswerEvaluationCase = {
      name: "mostly-unsupported-test",
      context: "The candidate has experience with Node.js.",
      answer: "The candidate has experience with Python, Django, Kubernetes, and Java.",
    };

    const result = evaluateAnswer(evaluationCase);

    assert.equal(result.passed, false);
    assert.ok(result.overlapRatio < 0.5, `Expected < 0.5, got ${result.overlapRatio}`);
  });

  it("3. returns passed: false and overlapRatio: 0 for empty answer", () => {
    const evaluationCase: AnswerEvaluationCase = {
      name: "empty-answer-test",
      context: "The candidate has experience with Node.js.",
      answer: "",
    };

    const result = evaluateAnswer(evaluationCase);

    assert.equal(result.passed, false);
    assert.equal(result.overlapRatio, 0);
  });

  it("4. returns passed: false and overlapRatio: 0 for empty context", () => {
    const evaluationCase: AnswerEvaluationCase = {
      name: "empty-context-test",
      context: "",
      answer: "The candidate has experience with Node.js.",
    };

    const result = evaluateAnswer(evaluationCase);

    assert.equal(result.passed, false);
    assert.equal(result.overlapRatio, 0);
  });

  it("5. returns passed: false and overlapRatio: 0 for whitespace-only answer or context", () => {
    const wsAnswerResult = evaluateAnswer({
      name: "ws-answer-test",
      context: "The candidate has experience with Node.js.",
      answer: "   \n\t  ",
    });
    assert.equal(wsAnswerResult.passed, false);
    assert.equal(wsAnswerResult.overlapRatio, 0);

    const wsContextResult = evaluateAnswer({
      name: "ws-context-test",
      context: "   \n\t  ",
      answer: "The candidate has experience with Node.js.",
    });
    assert.equal(wsContextResult.passed, false);
    assert.equal(wsContextResult.overlapRatio, 0);
  });

  it("6. performs case-insensitive matching between answer and context tokens", () => {
    const evaluationCase: AnswerEvaluationCase = {
      name: "case-insensitivity-test",
      context: "Candidate has experience with aws cloud infrastructure.",
      answer: "Candidate has experience with AWS cloud infrastructure.",
    };

    const result = evaluateAnswer(evaluationCase);

    assert.equal(result.passed, true);
    assert.ok(result.overlapRatio >= 0.5);
  });

  it("7. correctly preserves and evaluates technical terms (Node.js, TypeScript, C++, C#, AWS)", () => {
    const evaluationCase: AnswerEvaluationCase = {
      name: "technical-terms-test",
      context:
        "Proficient in Node.js, TypeScript, C++, C#, and AWS cloud deployments.",
      answer:
        "Candidate is proficient in Node.js, TypeScript, C++, C#, and AWS.",
    };

    const result = evaluateAnswer(evaluationCase);

    assert.equal(result.passed, true);
    assert.ok(result.overlapRatio >= 0.5);
  });

  it("8. preserves numeric tokens (such as years and counts) during evaluation", () => {
    const evaluationCase: AnswerEvaluationCase = {
      name: "numbers-test",
      context:
        "Completed migration in 2024 leading a team of 10 senior engineers in distributed systems.",
      answer:
        "Candidate led team in 2024 with 10 senior engineers in distributed systems.",
    };

    const result = evaluateAnswer(evaluationCase);

    assert.equal(result.passed, true);
    assert.ok(result.overlapRatio >= 0.5);
  });

  it("9. reflects unsupported claims in overlap ratio and fails when ratio is below threshold", () => {
    const evaluationCase: AnswerEvaluationCase = {
      name: "unsupported-claim-test",
      context: "The candidate works with Node.js.",
      answer:
        "The candidate works with Node.js, Kubernetes, Docker, Terraform, and Helm.",
    };

    const result = evaluateAnswer(evaluationCase);

    assert.equal(result.passed, false);
    assert.ok(result.overlapRatio < 0.5);
  });

  it("10. fails closed when answer contains only stop words", () => {
    const evaluationCase: AnswerEvaluationCase = {
      name: "stop-words-test",
      context: "The candidate has experience with Node.js and TypeScript.",
      answer: "is a and the or to with for of by",
    };

    const result = evaluateAnswer(evaluationCase);

    assert.equal(result.passed, false);
    assert.equal(result.overlapRatio, 0);
  });

  it("11. produces deterministic output for identical inputs", () => {
    const evaluationCase: AnswerEvaluationCase = {
      name: "determinism-test",
      context: "Developed distributed systems in Node.js and PostgreSQL.",
      answer: "Developed systems using Node.js and PostgreSQL.",
    };

    const run1 = evaluateAnswer(evaluationCase);
    const run2 = evaluateAnswer(evaluationCase);

    assert.deepEqual(run1, run2);
  });

  it("12. rejects malformed inputs with TypeError", () => {
    assert.throws(
      () => evaluateAnswer(null as unknown as AnswerEvaluationCase),
      { name: "TypeError", message: /evaluationCase must be an object/ },
    );

    assert.throws(
      () =>
        evaluateAnswer({
          name: "",
          answer: "Some answer",
          context: "Some context",
        }),
      { name: "TypeError", message: /evaluationCase\.name must be a non-empty string/ },
    );

    assert.throws(
      () =>
        evaluateAnswer({
          name: "valid-name",
          answer: 123 as unknown as string,
          context: "Some context",
        }),
      { name: "TypeError", message: /evaluationCase\.answer must be a string/ },
    );

    assert.throws(
      () =>
        evaluateAnswer({
          name: "valid-name",
          answer: "Some answer",
          context: 123 as unknown as string,
        }),
      { name: "TypeError", message: /evaluationCase\.context must be a string/ },
    );
  });
});
