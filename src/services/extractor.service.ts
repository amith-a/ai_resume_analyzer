import { extractText } from "unpdf";
import mammoth from "mammoth";
import { DocumentExtractionError } from "../errors/index.js";

export async function extractTextFromDocument(
  buffer: Buffer,
  mimeType: string
): Promise<{ text: string; pageCount?: number }> {
  try {
    if (mimeType === "application/pdf") {
      const { text, totalPages } = await extractText(new Uint8Array(buffer), {
        mergePages: true,
      });

      const extractedText = typeof text === "string" ? text : Array.isArray(text) ? (text as string[]).join("\n") : "";

      if (!extractedText || extractedText.trim().length === 0) {
        throw new DocumentExtractionError(
          "Document contains no readable text or is empty"
        );
      }

      return {
        text: extractedText,
        pageCount: totalPages,
      };
    }

    if (
      mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      const { value } = await mammoth.extractRawText({ buffer });

      if (!value || value.trim().length === 0) {
        throw new DocumentExtractionError(
          "Document contains no readable text or is empty"
        );
      }

      return {
        text: value,
      };
    }

    throw new DocumentExtractionError(
      `Unsupported document MIME type for text extraction: '${mimeType}'`
    );
  } catch (error: unknown) {
    if (error instanceof DocumentExtractionError) {
      throw error;
    }

    console.error("Text extraction parser failed:", error);
    throw new DocumentExtractionError(
      "Failed to extract text from document: file may be corrupted, encrypted, or malformed",
      error
    );
  }
}
