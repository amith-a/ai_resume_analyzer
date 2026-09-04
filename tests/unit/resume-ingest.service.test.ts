import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ingestResumeDocument } from "../../src/services/resume-ingest.service.js";
import { InvalidFileTypeError, DocumentExtractionError } from "../../src/errors/index.js";
import {
  SAMPLE_PDF_BUFFER,
  CORRUPT_PDF_BUFFER,
  SPOOFED_PNG_BUFFER,
} from "../fixtures/test-helpers.js";

describe("Resume Ingestion Pipeline Unit Tests (Phase 16)", () => {
  it("1. successfully ingests authentic PDF and returns normalized text, MIME, and page count", async () => {
    const result = await ingestResumeDocument(SAMPLE_PDF_BUFFER);

    assert.equal(result.detectedMime, "application/pdf");
    assert.equal(result.detectedExt, "pdf");
    assert.equal(result.pageCount, 1);
    assert.ok(result.characterCount > 0);
    assert.ok(result.normalizedText.includes("Jane Doe"));
    assert.ok(result.normalizedText.includes("Senior Full Stack Engineer"));
  });

  it("2. rejects spoofed non-document buffer with InvalidFileTypeError", async () => {
    await assert.rejects(
      async () => ingestResumeDocument(SPOOFED_PNG_BUFFER),
      (err: unknown) => {
        assert.ok(err instanceof InvalidFileTypeError);
        return true;
      },
    );
  });

  it("3. rejects empty buffer with InvalidFileTypeError", async () => {
    const emptyBuffer = Buffer.alloc(0);
    await assert.rejects(
      async () => ingestResumeDocument(emptyBuffer),
      (err: unknown) => {
        assert.ok(err instanceof InvalidFileTypeError);
        return true;
      },
    );
  });

  it("4. rejects corrupted PDF buffer with DocumentExtractionError", async () => {
    await assert.rejects(
      async () => ingestResumeDocument(CORRUPT_PDF_BUFFER),
      (err: unknown) => {
        assert.ok(err instanceof DocumentExtractionError);
        return true;
      },
    );
  });
});
