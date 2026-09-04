import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractTextFromDocument } from "../../src/services/extractor.service.js";
import { DocumentExtractionError } from "../../src/errors/index.js";
import { SAMPLE_PDF_BUFFER, CORRUPT_PDF_BUFFER } from "../fixtures/test-helpers.js";

describe("Text Extractor Service Unit Tests (Phase 16)", () => {
  it("1. extracts text and totalPages from a genuine PDF buffer", async () => {
    const res = await extractTextFromDocument(SAMPLE_PDF_BUFFER, "application/pdf");

    assert.ok(res.text.includes("Jane Doe"));
    assert.equal(res.pageCount, 1);
  });

  it("2. throws DocumentExtractionError when mimeType is unsupported", async () => {
    await assert.rejects(
      async () => extractTextFromDocument(Buffer.from("some text"), "text/plain"),
      (err: unknown) => {
        assert.ok(err instanceof DocumentExtractionError);
        assert.match(err.message, /Unsupported document MIME type/);
        return true;
      },
    );
  });

  it("3. throws DocumentExtractionError when PDF is corrupted or unparseable", async () => {
    await assert.rejects(
      async () => extractTextFromDocument(CORRUPT_PDF_BUFFER, "application/pdf"),
      (err: unknown) => {
        assert.ok(err instanceof DocumentExtractionError);
        return true;
      },
    );
  });

  it("4. throws DocumentExtractionError when document contains no extractable text", async () => {
    // Valid PDF structure with empty stream
    const emptyPdfBuffer = Buffer.from(
      "%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>\nendobj\n4 0 obj\n<< /Length 0 >>\nstream\n\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000201 00000 n \ntrailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n250\n%%EOF",
    );

    await assert.rejects(
      async () => extractTextFromDocument(emptyPdfBuffer, "application/pdf"),
      (err: unknown) => {
        assert.ok(err instanceof DocumentExtractionError);
        assert.match(err.message, /no readable text or is empty/);
        return true;
      },
    );
  });
});
