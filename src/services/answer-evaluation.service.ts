/**
 * Answer Evaluation Service
 *
 * Provides pure, deterministic offline evaluation to measure whether candidate
 * or generated answers are supported by provided resume context chunks.
 *
 * Boundary Limitation:
 * Lexical overlap does not prove that:
 * - the answer is semantically correct
 * - the answer fully answers the question
 * - the answer does not contain subtle hallucinations
 * - numbers or relationships in the answer are correct
 * - synonyms or paraphrases are equivalent
 * - retrieved context actually supports the meaning of every claim
 */

export interface AnswerEvaluationCase {
  name: string;
  answer: string;
  context: string;
}

export interface AnswerEvaluationResult {
  passed: boolean;
  overlapRatio: number;
}

const MINIMUM_OVERLAP_RATIO = 0.5;

/**
 * Small, focused set of common grammatical English stop words.
 * Note: Numbers, metrics, years, and technical terms are intentionally preserved.
 */
const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "but",
  "nor",
  "in",
  "on",
  "at",
  "to",
  "for",
  "of",
  "with",
  "by",
  "from",
  "as",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "has",
  "have",
  "had",
  "do",
  "does",
  "did",
  "that",
  "this",
  "these",
  "those",
  "it",
  "its",
  "he",
  "his",
  "she",
  "her",
  "they",
  "their",
]);

/**
 * Tokenizes text into lowercase alphanumeric and technical word tokens.
 */
function tokenize(text: string): string[] {
  const matches = text.toLowerCase().match(/[a-z0-9+#.-]+/g);
  return matches ?? [];
}

/**
 * Evaluates whether an answer is supported by the context based on
 * informative-token overlap ratio meeting the 0.5 threshold.
 *
 * Rules:
 * 1. Missing or malformed arguments throw TypeError.
 * 2. Empty or whitespace-only answer/context fails closed (passed: false, overlapRatio: 0).
 * 3. Answers yielding zero informative tokens fail closed (passed: false, overlapRatio: 0).
 * 4. Passes when overlapRatio >= 0.5.
 */
export function evaluateAnswer(evaluationCase: AnswerEvaluationCase): AnswerEvaluationResult {
  if (!evaluationCase || typeof evaluationCase !== "object") {
    throw new TypeError("evaluationCase must be an object");
  }

  if (typeof evaluationCase.name !== "string" || evaluationCase.name.trim().length === 0) {
    throw new TypeError("evaluationCase.name must be a non-empty string");
  }

  if (typeof evaluationCase.answer !== "string") {
    throw new TypeError("evaluationCase.answer must be a string");
  }

  if (typeof evaluationCase.context !== "string") {
    throw new TypeError("evaluationCase.context must be a string");
  }

  const trimmedAnswer = evaluationCase.answer.trim();
  const trimmedContext = evaluationCase.context.trim();

  if (trimmedAnswer.length === 0 || trimmedContext.length === 0) {
    return { passed: false, overlapRatio: 0 };
  }

  const answerTokens = tokenize(trimmedAnswer);
  const informativeAnswerTokens = answerTokens.filter((token) => !STOP_WORDS.has(token));

  if (informativeAnswerTokens.length === 0) {
    return { passed: false, overlapRatio: 0 };
  }

  const contextTokens = new Set(tokenize(trimmedContext));

  let matchedCount = 0;
  for (const token of informativeAnswerTokens) {
    if (contextTokens.has(token)) {
      matchedCount++;
    }
  }

  const overlapRatio = matchedCount / informativeAnswerTokens.length;
  const passed = overlapRatio >= MINIMUM_OVERLAP_RATIO;

  return {
    passed,
    overlapRatio,
  };
}
