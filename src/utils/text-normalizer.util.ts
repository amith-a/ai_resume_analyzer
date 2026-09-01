/**
 * Normalizes raw extracted document text for downstream LLM processing.
 *
 * Performs formatting cleanup:
 * 1. Converts Windows (\r\n) and legacy Mac (\r) to standard Unix line breaks (\n).
 * 2. Removes only clearly unwanted ASCII control characters while preserving normal whitespace and Unicode.
 * 3. Normalizes excessive horizontal whitespace per line for plain-text consumption.
 * 4. Trims leading and trailing whitespace per line.
 * 5. Collapses 3 or more consecutive blank lines into double newlines (\n\n).
 * 6. Trims document boundaries.
 */
export function normalizeResumeText(rawText?: string | null): string {
  if (!rawText || typeof rawText !== "string") {
    return "";
  }

  return (
    rawText
      // Standardize line endings to \n
      .replace(/\r\n|\r/g, "\n")
      // Remove unwanted ASCII control characters (preserving tab \x09 and newline \x0A)
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
      // Normalize horizontal whitespace and trim each line
      .split("\n")
      .map((line) => line.replace(/[^\S\n]+/g, " ").trim())
      .join("\n")
      // Collapse excessive blank lines (3+ newlines -> 2 newlines)
      .replace(/\n{3,}/g, "\n\n")
      // Trim entire document edges
      .trim()
  );
}
