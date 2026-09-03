export const GROUNDING_FALLBACK_TEXT =
  "The information is not available in the provided resume context.";

export interface GroundedAnswerParams {
  answer: string;
  hasUsableContext: boolean;
}

export interface GroundedAnswerResult {
  answer: string;
}

/**
 * Produces a safe, deterministic grounded answer from an LLM generation result.
 *
 * Grounding Rules:
 * 1. If there is no usable retrieved context, returns the standard grounding fallback.
 * 2. If the generated answer is empty or whitespace-only, returns the standard grounding fallback.
 * 3. If usable context exists and the answer is non-empty, returns the trimmed answer text.
 *
 * @param params - The raw generated answer and context availability flag.
 * @returns GroundedAnswerResult - Final safe answer text.
 */
export function produceGroundedAnswer(params: GroundedAnswerParams): GroundedAnswerResult {
  if (!params || typeof params !== "object") {
    throw new TypeError("params must be an object");
  }

  if (typeof params.answer !== "string") {
    throw new TypeError("answer must be a string");
  }

  if (typeof params.hasUsableContext !== "boolean") {
    throw new TypeError("hasUsableContext must be a boolean");
  }

  if (!params.hasUsableContext) {
    return { answer: GROUNDING_FALLBACK_TEXT };
  }

  const trimmedAnswer = params.answer.trim();
  if (trimmedAnswer.length === 0) {
    return { answer: GROUNDING_FALLBACK_TEXT };
  }

  return { answer: trimmedAnswer };
}
