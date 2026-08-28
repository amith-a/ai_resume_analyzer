import { validateResumeBuffer } from "../utils/file-validator.util.js";
import { InvalidFileTypeError } from "../errors/index.js";
import { extractTextFromDocument } from "./extractor.service.js";
import { normalizeResumeText } from "../utils/text-normalizer.util.js";
import type { IngestedResumeDocument } from "../types/resume.types.js";

/**
 * Reusable ingestion pipeline service:
 * 1. Validates magic bytes (detects genuine PDF / DOCX).
 * 2. Extracts raw text from document buffer in-memory.
 * 3. Cleans and normalizes whitespace and non-standard characters.
 *
 * @throws {InvalidFileTypeError} If file type is unsupported or spoofed (415).
 * @throws {DocumentExtractionError} If document is corrupted, encrypted, or empty (422).
 */
export async function ingestResumeDocument(
  buffer: Buffer
): Promise<IngestedResumeDocument> {
  const validation = await validateResumeBuffer(buffer);

  if (!validation.isValid || !validation.detectedMime || !validation.detectedExt) {
    throw new InvalidFileTypeError(
      validation.error ?? "Unsupported or unidentifiable file type"
    );
  }

  const extraction = await extractTextFromDocument(
    buffer,
    validation.detectedMime
  );

  const normalizedText = normalizeResumeText(extraction.text);

  return {
    detectedMime: validation.detectedMime,
    detectedExt: validation.detectedExt,
    normalizedText,
    characterCount: normalizedText.length,
    pageCount: extraction.pageCount,
  };
}
