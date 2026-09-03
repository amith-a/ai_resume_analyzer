/**
 * Evaluation Failure Analysis Service
 *
 * Provides pure, deterministic offline failure analysis to classify retrieval,
 * answer, and grounding evaluation failures into a small, actionable failure taxonomy.
 *
 * Boundary Limitation:
 * Classifies the immediate evaluation failure mode based on test inputs and
 * evaluation results. It does not diagnose deep model behavior, training data gaps,
 * or prompt semantics.
 */

import type { RetrievalEvaluationResult } from "./retrieval-evaluation.service.js";
import type { AnswerEvaluationResult } from "./answer-evaluation.service.js";
import type { GroundingCheckResult } from "./grounding-check.service.js";

export type EvaluationFailureReason =
  | "no-retrieved-context"
  | "expected-evidence-missing"
  | "low-answer-overlap"
  | "empty-answer"
  | "empty-context"
  | "unsupported-claim";

export interface FailureAnalysisResult {
  failed: boolean;
  reasons: EvaluationFailureReason[];
}

export interface RetrievalFailureAnalysisInput {
  result: RetrievalEvaluationResult;
  retrievedChunkCount: number;
}

export interface AnswerFailureAnalysisInput {
  result: AnswerEvaluationResult;
  answer: string;
  context: string;
}

export interface GroundingFailureAnalysisInput {
  result: GroundingCheckResult;
  answer: string;
  context: string;
}

/**
 * Analyzes a RetrievalEvaluationResult and classifies failure reasons deterministically.
 */
export function analyzeRetrievalFailure(
  input: RetrievalFailureAnalysisInput,
): FailureAnalysisResult {
  if (!input || typeof input !== "object") {
    throw new TypeError("input must be an object");
  }

  if (
    !input.result ||
    typeof input.result !== "object" ||
    typeof input.result.passed !== "boolean" ||
    !Array.isArray(input.result.matchedTerms) ||
    !Array.isArray(input.result.missingTerms)
  ) {
    throw new TypeError("input.result must be a valid RetrievalEvaluationResult object");
  }

  if (
    typeof input.retrievedChunkCount !== "number" ||
    !Number.isFinite(input.retrievedChunkCount) ||
    input.retrievedChunkCount < 0 ||
    !Number.isInteger(input.retrievedChunkCount)
  ) {
    throw new TypeError("input.retrievedChunkCount must be a non-negative integer");
  }

  if (input.result.passed) {
    return {
      failed: false,
      reasons: [],
    };
  }

  const reasons: EvaluationFailureReason[] = [];

  if (input.retrievedChunkCount === 0) {
    reasons.push("no-retrieved-context");
  }

  if (input.result.missingTerms.length > 0) {
    reasons.push("expected-evidence-missing");
  }

  return {
    failed: true,
    reasons,
  };
}

/**
 * Analyzes an AnswerEvaluationResult and classifies failure reasons deterministically.
 */
export function analyzeAnswerFailure(input: AnswerFailureAnalysisInput): FailureAnalysisResult {
  if (!input || typeof input !== "object") {
    throw new TypeError("input must be an object");
  }

  if (
    !input.result ||
    typeof input.result !== "object" ||
    typeof input.result.passed !== "boolean" ||
    typeof input.result.overlapRatio !== "number" ||
    !Number.isFinite(input.result.overlapRatio)
  ) {
    throw new TypeError("input.result must be a valid AnswerEvaluationResult object");
  }

  if (typeof input.answer !== "string") {
    throw new TypeError("input.answer must be a string");
  }

  if (typeof input.context !== "string") {
    throw new TypeError("input.context must be a string");
  }

  if (input.result.passed) {
    return {
      failed: false,
      reasons: [],
    };
  }

  const reasons: EvaluationFailureReason[] = [];
  const isAnswerEmpty = input.answer.trim().length === 0;
  const isContextEmpty = input.context.trim().length === 0;

  if (isAnswerEmpty) {
    reasons.push("empty-answer");
  }

  if (isContextEmpty) {
    reasons.push("empty-context");
  }

  if (!isAnswerEmpty && !isContextEmpty && input.result.overlapRatio < 0.5) {
    reasons.push("low-answer-overlap");
  }

  return {
    failed: true,
    reasons,
  };
}

/**
 * Analyzes a GroundingCheckResult and classifies failure reasons deterministically.
 */
export function analyzeGroundingFailure(
  input: GroundingFailureAnalysisInput,
): FailureAnalysisResult {
  if (!input || typeof input !== "object") {
    throw new TypeError("input must be an object");
  }

  if (
    !input.result ||
    typeof input.result !== "object" ||
    typeof input.result.grounded !== "boolean" ||
    typeof input.result.overlapRatio !== "number" ||
    !Number.isFinite(input.result.overlapRatio)
  ) {
    throw new TypeError("input.result must be a valid GroundingCheckResult object");
  }

  if (typeof input.answer !== "string") {
    throw new TypeError("input.answer must be a string");
  }

  if (typeof input.context !== "string") {
    throw new TypeError("input.context must be a string");
  }

  if (input.result.grounded) {
    return {
      failed: false,
      reasons: [],
    };
  }

  const reasons: EvaluationFailureReason[] = [];
  const isAnswerEmpty = input.answer.trim().length === 0;
  const isContextEmpty = input.context.trim().length === 0;

  if (isAnswerEmpty) {
    reasons.push("empty-answer");
  }

  if (isContextEmpty) {
    reasons.push("empty-context");
  }

  if (!isContextEmpty && !isAnswerEmpty && !input.result.grounded) {
    reasons.push("unsupported-claim");
  }

  return {
    failed: true,
    reasons,
  };
}
