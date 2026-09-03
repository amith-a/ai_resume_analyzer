/**
 * Grounding Check Service
 *
 * Implements a deterministic lexical grounding heuristic to determine whether
 * a generated answer is sufficiently supported by the supplied context chunks.
 *
 * Boundary Limitation:
 * Lexical overlap is an initial heuristic to catch unsupported claims and
 * hallucinations without an extra LLM call; it does not prove deep semantic entailment.
 */

export interface GroundingCheckOptions {
  minOverlapRatio?: number;
}

export interface GroundingCheckParams {
  answer: string;
  context: string;
  options?: GroundingCheckOptions;
}

export interface GroundingCheckResult {
  grounded: boolean;
  overlapRatio: number;
}

const DEFAULT_MIN_OVERLAP_RATIO = 0.5;

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
 * Checks whether an answer is grounded in the provided context based on
 * informative-token overlap ratio meeting the defined threshold.
 *
 * Rules:
 * 1. Missing, empty, or whitespace-only answer/context fails closed (grounded: false, overlapRatio: 0).
 * 2. Stop words are filtered out to extract informative answer tokens.
 * 3. Answers with zero informative tokens fail closed (grounded: false, overlapRatio: 0).
 * 4. Checks the ratio of informative answer tokens present in the context token set.
 * 5. Grounded if overlapRatio >= minOverlapRatio (default 0.5).
 */
export function checkGrounding(params: GroundingCheckParams): GroundingCheckResult {
  if (!params || typeof params !== "object") {
    throw new TypeError("params must be an object");
  }

  if (typeof params.answer !== "string") {
    throw new TypeError("answer must be a string");
  }

  if (typeof params.context !== "string") {
    throw new TypeError("context must be a string");
  }

  const trimmedAnswer = params.answer.trim();
  const trimmedContext = params.context.trim();

  if (trimmedAnswer.length === 0 || trimmedContext.length === 0) {
    return { grounded: false, overlapRatio: 0 };
  }

  const answerTokens = tokenize(trimmedAnswer);
  const informativeAnswerTokens = answerTokens.filter((token) => !STOP_WORDS.has(token));

  if (informativeAnswerTokens.length === 0) {
    return { grounded: false, overlapRatio: 0 };
  }

  const contextTokens = new Set(tokenize(trimmedContext));

  let matchedCount = 0;
  for (const token of informativeAnswerTokens) {
    if (contextTokens.has(token)) {
      matchedCount++;
    }
  }

  const overlapRatio = matchedCount / informativeAnswerTokens.length;
  const minOverlapRatio = params.options?.minOverlapRatio ?? DEFAULT_MIN_OVERLAP_RATIO;
  const grounded = overlapRatio >= minOverlapRatio;

  return {
    grounded,
    overlapRatio,
  };
}
