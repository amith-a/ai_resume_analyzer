/**
 * Data contracts for processed resume document text and ingestion pipeline results.
 */
export interface IngestedResumeDocument {
  detectedMime: string;
  detectedExt: string;
  normalizedText: string;
  characterCount: number;
  pageCount?: number;
}
