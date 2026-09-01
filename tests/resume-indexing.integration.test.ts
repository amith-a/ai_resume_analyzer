import { describe, it, before, after, mock } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import { app } from "../src/app.js";
import { pool } from "../src/config/db.js";
import {
  findDocumentById,
  findDocumentChunksByDocumentId,
  deleteDocumentById,
} from "../src/repositories/document.repository.js";

// Valid sample PDF buffer with authentic text content
const samplePdfBuffer = Buffer.from(
  "%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>\nendobj\n4 0 obj\n<< /Length 125 >>\nstream\nBT\n/F1 12 Tf\n100 700 Td\n(Jane Doe - Senior Full Stack Engineer specializing in TypeScript, Node.js, PostgreSQL, and Cloud Architecture.) Tj\nET\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000201 00000 n \ntrailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n377\n%%EOF",
);

// Spoofed PNG buffer
const spoofedPngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// Corrupted PDF buffer
const corruptedPdfBuffer = Buffer.from("%PDF-1.4\nCORRUPTED_BINARY_STREAM_NO_XREF\n%%EOF");

describe("POST /resumes Indexing Integration Tests", () => {
  let server: Server;
  let baseUrl: string;
  const createdDocumentIds: string[] = [];
  const originalFetch = globalThis.fetch;

  before(async () => {
    mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

      if (url.includes("/api/embed") || url.includes("/api/embeddings") || url.includes("11434")) {
        const bodyStr = typeof init?.body === "string" ? init.body : "";
        try {
          const parsed = JSON.parse(bodyStr);
          if (Array.isArray(parsed.input)) {
            const embeddings = parsed.input.map(() => new Array(768).fill(0.01));
            return new Response(JSON.stringify({ embeddings }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          }
        } catch {
          // pass
        }
        return new Response(JSON.stringify({ embedding: new Array(768).fill(0.01) }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      return originalFetch(input, init);
    });

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const address = server.address();
        if (address && typeof address === "object") {
          baseUrl = `http://localhost:${address.port}`;
        }
        resolve();
      });
    });
  });

  after(async () => {
    // Clean up created documents and cascade delete chunks
    for (const docId of createdDocumentIds) {
      await deleteDocumentById(docId, pool).catch(() => {});
    }

    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  it("1. uploads a valid PDF resume, extracts text, creates document, chunks, generates embeddings, and persists to DB", async () => {
    const formData = new FormData();
    const blob = new Blob([samplePdfBuffer], { type: "application/pdf" });
    formData.append("file", blob, "jane_doe_resume.pdf");

    const res = await fetch(`${baseUrl}/resumes`, {
      method: "POST",
      body: formData,
    });

    assert.equal(res.status, 200, `Expected 200 OK, got ${res.status}`);
    const json = (await res.json()) as any;

    assert.equal(json.status, "success");
    assert.match(json.message, /processed and indexed successfully/i);

    // Verify response structure
    const data = json.data;
    assert.ok(data.documentId, "Expected documentId in response data");
    createdDocumentIds.push(data.documentId);

    assert.equal(data.filename, "jane_doe_resume.pdf");
    assert.equal(data.detectedMime, "application/pdf");
    assert.equal(data.detectedExt, "pdf");
    assert.ok(data.characterCount > 0);
    assert.ok(data.chunkCount >= 1, "Expected at least 1 chunk to be created and indexed");
    assert.ok(data.text.includes("Jane Doe"));

    // 2. Read back parent document directly from database to verify persistence
    const savedDoc = await findDocumentById(data.documentId, pool);
    assert.ok(savedDoc, "Parent document should exist in database");
    assert.equal(savedDoc.title, "jane_doe_resume.pdf");
    assert.equal(savedDoc.document_type, "resume");
    assert.ok(savedDoc.raw_text?.includes("Jane Doe"));
    assert.equal((savedDoc.metadata as any)?.filename, "jane_doe_resume.pdf");

    // 3. Read back chunks from database to verify chunk persistence and 768-dim embeddings
    const savedChunks = await findDocumentChunksByDocumentId(data.documentId, pool);
    assert.equal(savedChunks.length, data.chunkCount);
    for (let i = 0; i < savedChunks.length; i++) {
      const chunk = savedChunks[i];
      assert.equal(chunk.document_id, data.documentId);
      assert.equal(chunk.chunk_index, i);
      assert.ok(chunk.content.length > 0);
      assert.equal(chunk.embedding?.length, 768, "Chunk embedding should have 768 dimensions");
      for (const val of chunk.embedding) {
        assert.ok(typeof val === "number" && Number.isFinite(val));
      }
    }
  });

  it("2. rejects unsupported or spoofed file with 415 Unsupported Media Type", async () => {
    const formData = new FormData();
    const blob = new Blob([spoofedPngBuffer], { type: "application/pdf" });
    formData.append("file", blob, "fake_resume.pdf");

    const res = await fetch(`${baseUrl}/resumes`, {
      method: "POST",
      body: formData,
    });

    assert.equal(res.status, 415);
    const json = (await res.json()) as any;
    assert.equal(json.status, "error");
    assert.match(json.message, /Unsupported or unidentifiable file type/i);
  });

  it("3. rejects corrupted PDF file with 422 Unprocessable Entity", async () => {
    const formData = new FormData();
    const blob = new Blob([corruptedPdfBuffer], { type: "application/pdf" });
    formData.append("file", blob, "corrupted_resume.pdf");

    const res = await fetch(`${baseUrl}/resumes`, {
      method: "POST",
      body: formData,
    });

    assert.equal(res.status, 422);
    const json = (await res.json()) as any;
    assert.equal(json.status, "error");
    assert.match(json.message, /corrupted|extraction/i);
  });

  it("4. rejects missing file upload with 400 Bad Request", async () => {
    const res = await fetch(`${baseUrl}/resumes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    assert.equal(res.status, 400);
    const json = (await res.json()) as any;
    assert.equal(json.status, "error");
    assert.match(json.message, /No resume file provided|No file uploaded|Unexpected field/i);
  });

  it("5. rejects oversized file (>5MB) with 413 Payload Too Large", async () => {
    const largeBuffer = Buffer.alloc(6 * 1024 * 1024);
    const formData = new FormData();
    const blob = new Blob([largeBuffer], { type: "application/pdf" });
    formData.append("file", blob, "huge_resume.pdf");

    const res = await fetch(`${baseUrl}/resumes`, {
      method: "POST",
      body: formData,
    });

    assert.equal(res.status, 413);
    const json = (await res.json()) as any;
    assert.equal(json.status, "error");
    assert.match(json.message, /File size exceeds limit/i);
  });
});
