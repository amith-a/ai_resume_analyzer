import { env } from "../config/env.js";

export interface ChunkOptions {
  /**
   * Maximum character size of each chunk.
   * Default: env.CHUNK_SIZE (500)
   */
  chunkSize?: number;

  /**
   * Character overlap between consecutive chunks.
   * Default: env.CHUNK_OVERLAP (100)
   */
  chunkOverlap?: number;
}

export interface TextChunk {
  chunkIndex: number;
  content: string;
}

/**
 * Splits normalized text into ordered, overlapping chunks while respecting
 * natural paragraph, sentence, and word boundaries where possible.
 *
 * @param text - The normalized text to split into chunks.
 * @param options - Configurable chunkSize and chunkOverlap.
 * @returns TextChunk[] - Array of ordered text chunks with sequential 0-based chunkIndex.
 */
export function chunkText(text?: string | null, options?: ChunkOptions): TextChunk[] {
  if (!text || typeof text !== "string" || text.trim().length === 0) {
    return [];
  }

  const chunkSize = options?.chunkSize ?? env.CHUNK_SIZE;
  const chunkOverlap = options?.chunkOverlap ?? env.CHUNK_OVERLAP;

  if (typeof chunkSize !== "number" || chunkSize <= 0 || !Number.isFinite(chunkSize)) {
    throw new RangeError("chunkSize must be a positive integer");
  }

  if (
    typeof chunkOverlap !== "number" ||
    chunkOverlap < 0 ||
    !Number.isFinite(chunkOverlap) ||
    chunkOverlap >= chunkSize
  ) {
    throw new RangeError(
      "chunkOverlap must be a non-negative integer strictly less than chunkSize",
    );
  }

  const cleanText = text.trim();

  // If text fits within single chunk, return immediately
  if (cleanText.length <= chunkSize) {
    return [{ chunkIndex: 0, content: cleanText }];
  }

  const chunks: TextChunk[] = [];
  let startIndex = 0;
  let chunkIndex = 0;

  while (startIndex < cleanText.length) {
    const targetEnd = startIndex + chunkSize;

    if (targetEnd >= cleanText.length) {
      // Remaining text fits in final chunk
      const content = cleanText.slice(startIndex).trim();
      if (content.length > 0) {
        chunks.push({ chunkIndex, content });
      }
      break;
    }

    // Look for natural boundary between (startIndex + chunkOverlap) and targetEnd
    const searchSlice = cleanText.slice(startIndex, targetEnd);
    let splitOffset = -1;

    // 1. Prefer splitting on paragraph break (\n\n)
    const paragraphBreak = searchSlice.lastIndexOf("\n\n");
    if (paragraphBreak > chunkOverlap) {
      splitOffset = paragraphBreak + 2;
    } else {
      // 2. Next, line break (\n)
      const lineBreak = searchSlice.lastIndexOf("\n");
      if (lineBreak > chunkOverlap) {
        splitOffset = lineBreak + 1;
      } else {
        // 3. Next, sentence punctuation (. , ! , ?)
        const sentenceEndMatch = searchSlice.match(/([.!?]\s)[^.!?]*$/);
        if (
          sentenceEndMatch &&
          sentenceEndMatch.index !== undefined &&
          sentenceEndMatch.index > chunkOverlap
        ) {
          splitOffset = sentenceEndMatch.index + sentenceEndMatch[1].length;
        } else {
          // 4. Next, word boundary (space)
          const spaceBreak = searchSlice.lastIndexOf(" ");
          if (spaceBreak > chunkOverlap) {
            splitOffset = spaceBreak + 1;
          }
        }
      }
    }

    const actualEnd = splitOffset !== -1 ? startIndex + splitOffset : targetEnd;
    const chunkContent = cleanText.slice(startIndex, actualEnd).trim();

    if (chunkContent.length > 0) {
      chunks.push({
        chunkIndex,
        content: chunkContent,
      });
      chunkIndex++;
    }

    // Advance start index with overlap, ensuring strict forward progress
    const nextStart = actualEnd - chunkOverlap;
    startIndex = nextStart > startIndex ? nextStart : actualEnd;
  }

  return chunks;
}
