import { describe, it, before, after, mock } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import type pg from "pg";
import { app } from "../../src/app.js";
import { probeTestDatabase } from "../fixtures/db-helper.js";
import { SAMPLE_PDF_BUFFER, createMockOllamaFetch } from "../fixtures/test-helpers.js";
import {
  findDocumentById,
  findDocumentChunksByDocumentId,
  deleteDocumentById,
} from "../../src/repositories/document.repository.js";

describe("End-to-End API Lifecycle Integration Tests (Phase 16)", () => {
  let server: Server;
  let baseUrl: string;
  let pool: pg.Pool | null = null;
  let isDbAvailable = false;
  let skipReason = "PostgreSQL test database unreachable";
  let createdDocumentId: string | null = null;
  let originalFetch: typeof globalThis.fetch;

  before(async () => {
    originalFetch = globalThis.fetch;

    // 1. Probe test database
    const probe = await probeTestDatabase();
    isDbAvailable = probe.isDbAvailable;
    pool = probe.pool;
    if (probe.skipReason) {
      skipReason = probe.skipReason;
    }

    // 2. Start live HTTP server on ephemeral port
    await new Promise<void>((resolve) => {
      server = app.listen(0, "127.0.0.1", () => {
        const addr = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });

    // 3. Mock Ollama embeddings and LLM generation deterministically
    mock.method(globalThis, "fetch", createMockOllamaFetch());
  });

  after(async () => {
    // 1. Clean up created document if still present
    if (pool && createdDocumentId) {
      try {
        await deleteDocumentById(createdDocumentId, pool);
      } catch {
        // ignore cleanup error
      }
    }

    // 2. Close db pool
    if (pool) {
      try {
        await pool.end();
      } catch {
        // ignore
      }
    }

    // 3. Close HTTP server
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }

    // 4. Restore original fetch
    if (originalFetch) {
      globalThis.fetch = originalFetch;
    }
  });

  it("executes complete lifecycle: upload -> analyze -> search -> compare -> ask -> cleanup", async (t) => {
    if (!isDbAvailable || !pool) {
      t.skip(skipReason);
      return;
    }

    // -------------------------------------------------------------
    // Step 1: POST /resumes — Ingest, extract, and index resume PDF
    // -------------------------------------------------------------
    const formData = new FormData();
    const pdfBlob = new Blob([SAMPLE_PDF_BUFFER], { type: "application/pdf" });
    formData.append("file", pdfBlob, "jane_doe_cv.pdf");

    const uploadRes = await fetch(`${baseUrl}/resumes`, {
      method: "POST",
      body: formData,
    });

    assert.equal(uploadRes.status, 200, "Upload endpoint must return 200 OK");
    const uploadBody = (await uploadRes.json()) as {
      status: string;
      data: {
        documentId: string;
        filename: string;
        detectedMime: string;
        chunkCount: number;
        text: string;
      };
    };

    assert.equal(uploadBody.status, "success");
    assert.ok(uploadBody.data.documentId, "documentId must be present");
    assert.equal(uploadBody.data.detectedMime, "application/pdf");
    assert.ok(uploadBody.data.chunkCount > 0, "Chunks must have been created and indexed");
    assert.ok(uploadBody.data.text.includes("Jane Doe"));

    createdDocumentId = uploadBody.data.documentId;

    // Verify database record exists
    const docInDb = await findDocumentById(createdDocumentId, pool);
    assert.ok(docInDb, "Document must exist in database");
    const chunksInDb = await findDocumentChunksByDocumentId(createdDocumentId, pool);
    assert.equal(
      chunksInDb.length,
      uploadBody.data.chunkCount,
      "Chunk count in DB must match response",
    );

    // -------------------------------------------------------------
    // Step 2: POST /resumes/analyze — Structured candidate profile extraction
    // -------------------------------------------------------------
    const analyzeRes = await fetch(`${baseUrl}/resumes/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId: createdDocumentId }),
    });

    assert.equal(analyzeRes.status, 200, "Analyze endpoint must return 200 OK");
    const analyzeBody = (await analyzeRes.json()) as {
      status: string;
      data: {
        candidateSummary: string;
        skills: string[];
      };
    };

    assert.equal(analyzeBody.status, "success");
    assert.ok(analyzeBody.data.candidateSummary, "candidateSummary must be present");
    assert.ok(Array.isArray(analyzeBody.data.skills), "skills must be an array");

    // -------------------------------------------------------------
    // Step 3: POST /search/chunks — Direct semantic vector chunk retrieval
    // -------------------------------------------------------------
    const searchRes = await fetch(`${baseUrl}/search/chunks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: "TypeScript Node.js PostgreSQL",
        documentId: createdDocumentId,
        topK: 5,
        maxDistanceThreshold: 0.9,
      }),
    });

    assert.equal(searchRes.status, 200, "Search chunks endpoint must return 200 OK");
    const searchBody = (await searchRes.json()) as {
      chunks: Array<{
        id: string;
        document_id: string;
        chunk_index: number;
        content: string;
        distance: number;
      }>;
    };

    assert.ok(Array.isArray(searchBody.chunks), "chunks must be an array");
    assert.ok(searchBody.chunks.length > 0, "Should retrieve indexed chunks");
    assert.equal(
      searchBody.chunks[0].document_id,
      createdDocumentId,
      "Chunk document_id must match requested documentId",
    );

    // -------------------------------------------------------------
    // Step 4: POST /jobs/compare — Job description match & gap analysis
    // -------------------------------------------------------------
    const compareRes = await fetch(`${baseUrl}/jobs/compare`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        documentId: createdDocumentId,
        jobDescription:
          "Senior Full Stack Engineer: Requirements include 5+ years of Node.js, TypeScript, PostgreSQL, and Docker experience.",
      }),
    });

    assert.equal(compareRes.status, 200, "Job compare endpoint must return 200 OK");
    const compareBody = (await compareRes.json()) as {
      status: string;
      data: {
        overallFit: string;
        matchedSkills: string[];
      };
    };

    assert.equal(compareBody.status, "success");
    assert.ok(["strong", "moderate", "weak"].includes(compareBody.data.overallFit));

    // -------------------------------------------------------------
    // Step 5: POST /resumes/:id/ask — Grounded RAG question answering with citations
    // -------------------------------------------------------------
    const askRes = await fetch(`${baseUrl}/resumes/${createdDocumentId}/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: "What is this candidate's engineering background?",
        topK: 3,
      }),
    });

    assert.equal(askRes.status, 200, "Ask endpoint must return 200 OK");
    const askBody = (await askRes.json()) as {
      status: string;
      data: {
        answer: string;
        sources: Array<{
          id: string;
          chunkId: string;
          documentId: string;
          chunkIndex: number;
          content: string;
        }>;
      };
    };

    assert.equal(askBody.status, "success");
    assert.ok(askBody.data.answer, "Answer must be generated");
    assert.ok(Array.isArray(askBody.data.sources), "Sources must be returned");

    // -------------------------------------------------------------
    // Step 6: Cleanup & Cascade Deletion Verification
    // -------------------------------------------------------------
    await deleteDocumentById(createdDocumentId, pool);
    const docAfterDelete = await findDocumentById(createdDocumentId, pool);
    assert.equal(docAfterDelete, null, "Document must be deleted");
    const chunksAfterDelete = await findDocumentChunksByDocumentId(createdDocumentId, pool);
    assert.equal(chunksAfterDelete.length, 0, "All chunks must be deleted via cascade");

    createdDocumentId = null;
  });
});
