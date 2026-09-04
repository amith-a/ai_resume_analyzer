import { extractText } from "unpdf";
import mammoth from "mammoth";
import { DocumentExtractionError } from "../errors/index.js";
import { logger, getRequestId } from "../config/logger.js";

export async function extractTextFromDocument(
  buffer: Buffer,
  mimeType: string,
): Promise<{ text: string; pageCount?: number }> {
  const startTime = Date.now();
  try {
    if (mimeType === "application/pdf") {
      const { text, totalPages } = await extractText(new Uint8Array(buffer), {
        mergePages: true,
      });

      const extractedText =
        typeof text === "string" ? text : Array.isArray(text) ? (text as string[]).join("\n") : "";

      if (!extractedText || extractedText.trim().length === 0) {
        throw new DocumentExtractionError("Document contains no readable text or is empty");
      }

      const durationMs = Date.now() - startTime;
      const requestId = getRequestId();
      logger.info(
        {
          operation: "text_extraction",
          status: "success",
          mimeType,
          textLength: extractedText.length,
          ...(totalPages !== undefined ? { pageCount: totalPages } : {}),
          durationMs,
          ...(requestId ? { requestId } : {}),
        },
        `Document text extracted successfully in ${durationMs}ms`,
      );

      return {
        text: extractedText,
        pageCount: totalPages,
      };
    }

    if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
      const { value } = await mammoth.extractRawText({ buffer });

      if (!value || value.trim().length === 0) {
        throw new DocumentExtractionError("Document contains no readable text or is empty");
      }

      const durationMs = Date.now() - startTime;
      const requestId = getRequestId();
      logger.info(
        {
          operation: "text_extraction",
          status: "success",
          mimeType,
          textLength: value.length,
          durationMs,
          ...(requestId ? { requestId } : {}),
        },
        `Document text extracted successfully in ${durationMs}ms`,
      );

      return {
        text: value,
      };
    }

    throw new DocumentExtractionError(
      `Unsupported document MIME type for text extraction: '${mimeType}'`,
    );
  } catch (error: unknown) {
    if (error instanceof DocumentExtractionError) {
      throw error;
    }

    const durationMs = Date.now() - startTime;
    const errorType = error instanceof Error ? error.name : "Error";
    const requestId = getRequestId();
    logger.error(
      {
        operation: "text_extraction",
        status: "error",
        errorType,
        mimeType,
        durationMs,
        ...(requestId ? { requestId } : {}),
      },
      `Text extraction parser failed (${errorType})`,
    );
    throw new DocumentExtractionError(
      "Failed to extract text from document: file may be corrupted, encrypted, or malformed",
      error,
    );
  }
}
