export interface ContextChunkItem {
  content: string;
}

/**
 * Constructs a deterministic, formatted context string from retrieved chunks for RAG.
 *
 * Format:
 * [Source 1]
 * <chunk content>
 *
 * [Source 2]
 * <chunk content>
 *
 * Preserves the original retrieval relevance order. Returns an empty string for empty input.
 *
 * @param chunks - Array of retrieved chunk items ordered by relevance.
 * @returns Formatted context text string.
 */
export function constructContext(chunks: ContextChunkItem[]): string {
  if (!Array.isArray(chunks) || chunks.length === 0) {
    return "";
  }

  const sections: string[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const content = typeof chunk?.content === "string" ? chunk.content.trim() : "";

    if (content.length > 0) {
      sections.push(`[Source ${i + 1}]\n${content}`);
    }
  }

  return sections.join("\n\n");
}
