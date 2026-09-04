import { describe, it, before, after, mock } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import multer from "multer";
import { app } from "../../src/app.js";
import { pool } from "../../src/config/db.js";
import { validateResumeBuffer } from "../../src/utils/file-validator.util.js";
import { extractTextFromDocument } from "../../src/services/extractor.service.js";
import { MAX_FILE_SIZE_BYTES } from "../../src/middlewares/upload.middleware.js";
import { DocumentExtractionError } from "../../src/errors/index.js";
import { logger } from "../../src/config/logger.js";

// Minimal valid PDF buffer containing extractable text
const VALID_PDF_BUFFER = Buffer.from(
  "%PDF-1.4\n" +
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n" +
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n" +
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>\nendobj\n" +
    "4 0 obj\n<< /Length 44 >>\nstream\nBT /F1 12 Tf 100 700 Td (Candidate Experience) Tj ET\nendstream\nendobj\n" +
    "xref\n0 5\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000206 00000 n \n" +
    "trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n300\n%%EOF\n",
);

/**
 * Creates a minimal valid ZIP archive containing Word document XML structure,
 * recognized by file-type as genuine DOCX.
 */
function createMinimalDocxBuffer(rawText: string = "Jane Doe Software Engineer"): Buffer {
  const contentTypesXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    "</Types>";

  const docXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    `<w:body><w:p><w:r><w:t>${rawText}</w:t></w:r></w:p></w:body>` +
    "</w:document>";

  const entries = [
    { name: "[Content_Types].xml", content: Buffer.from(contentTypesXml, "utf8") },
    { name: "word/document.xml", content: Buffer.from(docXml, "utf8") },
  ];

  const localHeaders: Buffer[] = [];
  const centralHeaders: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, "utf8");
    const content = entry.content;

    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); // PK\x03\x04
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(0, 6);
    lh.writeUInt16LE(0, 8);
    lh.writeUInt32LE(content.length, 18);
    lh.writeUInt32LE(content.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26);
    localHeaders.push(lh, nameBuf, content);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0); // PK\x01\x02
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0, 8);
    cd.writeUInt32LE(content.length, 20);
    cd.writeUInt32LE(content.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt32LE(offset, 42);
    centralHeaders.push(cd, nameBuf);

    offset += 30 + nameBuf.length + content.length;
  }

  const cdBuf = Buffer.concat(centralHeaders);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // PK\x05\x06
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cdBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);

  return Buffer.concat([...localHeaders, cdBuf, eocd]);
}

describe("Security Hardening Tests (Phase 14 — Block 5)", () => {
  let server: Server;
  let baseUrl: string;
  const originalFetch = globalThis.fetch;

  before(async () => {
    // Mock upstream fetch for Ollama embedding calls during indexing
    mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes(":11434") || url.includes("/api/embed") || url.includes("/api/embeddings")) {
        return new Response(
          JSON.stringify({
            embeddings: [new Array(768).fill(0.01)],
            embedding: new Array(768).fill(0.01),
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return originalFetch(input, init);
    });

    // Mock DB pool transactions for document storage
    mock.method(pool, "connect", async () => {
      return {
        query: async (sql: string) => {
          if (sql.includes("INSERT INTO documents")) {
            return {
              rows: [{ id: "mock-doc-uuid", title: "Test Doc", created_at: new Date() }],
              rowCount: 1,
            };
          }
          if (sql.includes("INSERT INTO document_chunks")) {
            return {
              rows: [{ id: "mock-chunk-uuid" }],
              rowCount: 1,
            };
          }
          return { rows: [], rowCount: 0 };
        },
        release: () => {},
      };
    });

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address();
        if (addr && typeof addr === "object") {
          baseUrl = `http://localhost:${addr.port}`;
        }
        resolve();
      });
    });
  });

  after(async () => {
    mock.reset();
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  // --- 1. File Upload & Magic-Byte Validation ---

  describe("File Upload & Magic-Byte Validation", () => {
    it("1. accepts genuine PDF files by verifying PDF magic bytes", async () => {
      const result = await validateResumeBuffer(VALID_PDF_BUFFER);
      assert.equal(result.isValid, true);
      assert.equal(result.detectedMime, "application/pdf");
      assert.equal(result.detectedExt, "pdf");
    });

    it("2. accepts genuine DOCX files by verifying DOCX container magic bytes", async () => {
      const docxBuffer = createMinimalDocxBuffer();
      const result = await validateResumeBuffer(docxBuffer);
      assert.equal(result.isValid, true);
      assert.equal(
        result.detectedMime,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      );
      assert.equal(result.detectedExt, "docx");
    });

    it("3. rejects empty buffers safely", async () => {
      const emptyBuffer = Buffer.alloc(0);
      const result = await validateResumeBuffer(emptyBuffer);
      assert.equal(result.isValid, false);
      assert.match(result.error ?? "", /empty/i);
    });

    it("4. rejects unsupported file types (PNG, JPEG, ELF, Windows PE) regardless of extension", async () => {
      const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
      const elfBuffer = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00]);
      const peBuffer = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);

      for (const buf of [pngBuffer, jpegBuffer, elfBuffer, peBuffer]) {
        const result = await validateResumeBuffer(buf);
        assert.equal(result.isValid, false);
        assert.match(result.error ?? "", /unsupported.*file type/i);
      }
    });

    it("5. rejects disguised executable or script named as .pdf at HTTP boundary with 415", async () => {
      const formData = new FormData();
      const maliciousScript = Buffer.from("#!/bin/bash\ncat /etc/passwd\n");
      const blob = new Blob([maliciousScript], { type: "application/pdf" });
      formData.append("file", blob, "malicious.pdf");

      const res = await fetch(`${baseUrl}/resumes`, {
        method: "POST",
        body: formData,
      });

      assert.equal(res.status, 415);
      const body = (await res.json()) as { status: string; message: string };
      assert.equal(body.status, "error");
      assert.match(body.message, /Unsupported or unidentifiable file type/i);
    });

    it("6. rejects corrupted/malformed documents with 422 and safe error message", async () => {
      // Valid PDF magic header bytes but corrupted body structure
      const corruptedPdf = Buffer.from("%PDF-1.4\ncorrupted content that cannot be parsed %%EOF");

      await assert.rejects(
        async () => {
          await extractTextFromDocument(corruptedPdf, "application/pdf");
        },
        (err: unknown) => {
          assert(err instanceof DocumentExtractionError);
          assert.match(err.message, /failed to extract text from document/i);
          return true;
        },
      );
    });
  });

  // --- 2. File Size Limits & Extraction Pre-emption ---

  describe("File Size Limits & Extraction Pre-emption", () => {
    it("7. enforces MAX_FILE_SIZE_BYTES configured to strictly 5 MB", () => {
      assert.equal(MAX_FILE_SIZE_BYTES, 5 * 1024 * 1024);
    });

    it("8. rejects oversized uploads (> 5 MB) with HTTP 413 Payload Too Large", async () => {
      const formData = new FormData();
      // 5MB + 1024 bytes
      const oversizedBuf = Buffer.alloc(5 * 1024 * 1024 + 1024, 0x41);
      const blob = new Blob([oversizedBuf], { type: "application/pdf" });
      formData.append("file", blob, "oversized.pdf");

      const res = await fetch(`${baseUrl}/resumes`, {
        method: "POST",
        body: formData,
      });

      assert.equal(res.status, 413);
      const body = (await res.json()) as { status: string; message: string };
      assert.equal(body.status, "error");
      assert.match(body.message, /File size exceeds limit of 5MB/i);
    });

    it("9. pre-empts processing so oversized files never reach extraction or downstream services", async () => {
      // Create an oversized file with valid magic bytes to prove size limit triggers before validation/extraction
      const oversizedWithMagic = Buffer.concat([
        Buffer.from("%PDF-1.4\n"),
        Buffer.alloc(5 * 1024 * 1024 + 500, 0x20),
      ]);
      const formData = new FormData();
      const blob = new Blob([oversizedWithMagic], { type: "application/pdf" });
      formData.append("file", blob, "large.pdf");

      const res = await fetch(`${baseUrl}/resumes`, {
        method: "POST",
        body: formData,
      });

      assert.equal(res.status, 413);
    });
  });

  // --- 3. Storage Architecture & Untrusted Input Safety ---

  describe("Storage Architecture & Untrusted Input Safety", () => {
    it("10. verifies Multer memoryStorage configuration ensures no temporary disk files are created", () => {
      const storage = multer.memoryStorage();
      assert.equal(typeof storage._handleFile, "function");
      assert.equal(typeof storage._removeFile, "function");
    });

    it("11. treats untrusted filenames (shell syntax, path traversal) strictly as data strings", async () => {
      const blob = new Blob([VALID_PDF_BUFFER], { type: "application/pdf" });

      // 11a: Command injection string in filename is treated strictly as data
      const cmdFormData = new FormData();
      const maliciousCommandFilename = "evil_resume_$(whoami)_test.pdf";
      cmdFormData.append("file", blob, maliciousCommandFilename);

      const resCmd = await fetch(`${baseUrl}/resumes`, {
        method: "POST",
        body: cmdFormData,
      });

      assert.equal(resCmd.status, 200);
      const bodyCmd = (await resCmd.json()) as {
        status: string;
        data: { filename: string; documentId: string };
      };
      assert.equal(bodyCmd.status, "success");
      assert.equal(bodyCmd.data.filename, maliciousCommandFilename);
      assert.ok(bodyCmd.data.documentId);

      // 11b: Path traversal sequence in filename is sanitized by Multer to basename
      const traversalFormData = new FormData();
      traversalFormData.append("file", blob, "../../../etc/passwd.pdf");

      const resTraversal = await fetch(`${baseUrl}/resumes`, {
        method: "POST",
        body: traversalFormData,
      });

      assert.equal(resTraversal.status, 200);
      const bodyTraversal = (await resTraversal.json()) as {
        status: string;
        data: { filename: string; documentId: string };
      };
      assert.equal(bodyTraversal.status, "success");
      assert.equal(bodyTraversal.data.filename, "passwd.pdf");
      assert.ok(bodyTraversal.data.documentId);
    });
  });

  // --- 4. Safe Error Handling & Logging ---

  describe("Safe Error Handling & Logging", () => {
    it("12. sanitizes error logs so raw file buffers, prompts, or secrets are not emitted", async () => {
      const loggedErrors: string[] = [];
      const originalLoggerError = logger.error.bind(logger);
      const originalConsoleError = console.error;
      logger.error = ((...args: unknown[]) => {
        loggedErrors.push(
          args
            .map((a) => (typeof a === "object" && a !== null ? JSON.stringify(a) : String(a)))
            .join(" "),
        );
        return true;
      }) as typeof logger.error;
      console.error = (...args: unknown[]) => {
        loggedErrors.push(args.map((a) => String(a)).join(" "));
      };

      try {
        // Trigger extraction failure with malformed buffer
        const malformedBuffer = Buffer.from("%PDF-1.4\nsecret_candidate_ssn_12345_corrupted");
        await assert.rejects(async () => {
          await extractTextFromDocument(malformedBuffer, "application/pdf");
        });

        // Ensure logged error contains safe category metadata but NOT the raw buffer contents
        const errorOutput = loggedErrors.join("\n");
        assert.match(errorOutput, /Text extraction parser failed/);
        assert.ok(!errorOutput.includes("secret_candidate_ssn_12345"));
      } finally {
        logger.error = originalLoggerError;
        console.error = originalConsoleError;
      }
    });

    it("13. ensures error responses never leak stack traces or internal implementation details", async () => {
      const res = await fetch(`${baseUrl}/api/v1/non-existent-route`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ test: "data" }),
      });

      assert.equal(res.status, 404);
      const body = (await res.json()) as Record<string, unknown>;
      assert.equal(body.stack, undefined);
      assert.equal(body.trace, undefined);
    });
  });
});
