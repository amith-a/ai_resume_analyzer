/**
 * Retrieval Evaluation Service
 *
 * Provides pure, deterministic evaluation to determine whether retrieved
 * resume chunks contain expected evidence terms or phrases for a query.
 *
 * Boundary Limitation:
 * Lexical retrieval evaluation confirms the presence of expected terms/phrases
 * within retrieved chunks. It does not establish semantic entailment, whether
 * the chunk fully answers the question, whether retrieval ranking was optimal,
 * or whether phrasing variations/synonyms convey equivalent meaning.
 */

export interface RetrievalEvaluationCase {
  name: string;
  query: string;
  expectedTerms: string[];
}

export interface RetrievalChunkInput {
  content: string;
}

export interface RetrievalEvaluationResult {
  passed: boolean;
  matchedTerms: string[];
  missingTerms: string[];
}

/**
 * Tokenizes text into lowercase alphanumeric and technical word tokens.
 */
function tokenize(text: string): string[] {
  const rawMatches = text.toLowerCase().match(/[a-z0-9+#.-]+/g) ?? [];
  return rawMatches
    .map((token) => token.replace(/^[.,;:!?]+|[.,;:!?]+$/g, ""))
    .filter((token) => token.length > 0);
}

/**
 * Checks whether `sub` tokens appear as a contiguous subsequence within `target` tokens.
 */
function containsContiguousSubsequence(target: string[], sub: string[]): boolean {
  if (sub.length === 0 || target.length < sub.length) {
    return false;
  }

  for (let i = 0; i <= target.length - sub.length; i++) {
    let match = true;
    for (let j = 0; j < sub.length; j++) {
      if (target[i + j] !== sub[j]) {
        match = false;
        break;
      }
    }
    if (match) {
      return true;
    }
  }

  return false;
}

/**
 * Evaluates whether retrieved chunks contain the expected terms/phrases
 * specified in an evaluation case.
 *
 * Rules:
 * 1. Rejects invalid or malformed arguments with TypeError.
 * 2. Empty expectedTerms fails closed (passed: false, matchedTerms: [], missingTerms: []).
 * 3. Empty retrievedChunks fails closed (passed: false, matchedTerms: [], missingTerms: [...expectedTerms]).
 * 4. Checks each expected term using token/phrase-aware contiguous subsequence matching.
 * 5. Returns passed: true only when all expected terms are present.
 */
export function evaluateRetrieval(
  evaluationCase: RetrievalEvaluationCase,
  retrievedChunks: RetrievalChunkInput[],
): RetrievalEvaluationResult {
  if (!evaluationCase || typeof evaluationCase !== "object") {
    throw new TypeError("evaluationCase must be an object");
  }

  if (typeof evaluationCase.name !== "string" || evaluationCase.name.trim().length === 0) {
    throw new TypeError("evaluationCase.name must be a non-empty string");
  }

  if (typeof evaluationCase.query !== "string" || evaluationCase.query.trim().length === 0) {
    throw new TypeError("evaluationCase.query must be a non-empty string");
  }

  if (
    !Array.isArray(evaluationCase.expectedTerms) ||
    evaluationCase.expectedTerms.some((t) => typeof t !== "string" || t.trim().length === 0)
  ) {
    throw new TypeError("evaluationCase.expectedTerms must be an array of non-empty strings");
  }

  if (
    !Array.isArray(retrievedChunks) ||
    retrievedChunks.some(
      (chunk) => !chunk || typeof chunk !== "object" || typeof chunk.content !== "string",
    )
  ) {
    throw new TypeError(
      "retrievedChunks must be an array of chunk objects containing string content",
    );
  }

  if (evaluationCase.expectedTerms.length === 0) {
    return {
      passed: false,
      matchedTerms: [],
      missingTerms: [],
    };
  }

  if (retrievedChunks.length === 0) {
    return {
      passed: false,
      matchedTerms: [],
      missingTerms: [...evaluationCase.expectedTerms],
    };
  }

  const combinedContent = retrievedChunks.map((c) => c.content).join(" ");
  const contentTokens = tokenize(combinedContent);

  const matchedTerms: string[] = [];
  const missingTerms: string[] = [];

  for (const term of evaluationCase.expectedTerms) {
    const termTokens = tokenize(term);

    if (termTokens.length > 0 && containsContiguousSubsequence(contentTokens, termTokens)) {
      matchedTerms.push(term);
    } else {
      missingTerms.push(term);
    }
  }

  const passed = missingTerms.length === 0 && matchedTerms.length > 0;

  return {
    passed,
    matchedTerms,
    missingTerms,
  };
}
