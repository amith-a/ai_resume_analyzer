import { describe, it, before, after, mock } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import { app } from "../../src/app.js";
import { pool } from "../../src/config/db.js";

const TEST_DOC_UUID = "22222222-2222-2222-2222-222222222222";
const mockVector = new Array(768).fill(0.05);

describe("API & Error Boundaries Tests (Phase 14 — Block 2)", () => {
  let server: Server;
  let baseUrl: string;
  let shouldDbFail = false;
  let shouldOllamaFail = false;

  const originalFetch = globalThis.fetch;

  before(async () => {
    // Mock upstream fetch for Ollama embeddings/chat
    mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

      if (url.includes("/api/embed") || url.includes("/api/embeddings") || url.includes(":11434")) {
        if (shouldOllamaFail) {
          throw new Error("Ollama connection timeout");
        }
        return new Response(
          JSON.stringify({
            embeddings: [mockVector],
            embedding: mockVector,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      return originalFetch(input, init);
    });

    // Mock DB queries
    mock.method(pool, "query", async (_sql: string, params?: unknown[]) => {
      if (shouldDbFail) {
        throw new Error("Unexpected database connection drop: FATAL secret_db_password_123");
      }

      // Default: document not found unless params contain specific mock ID
      if (params && params[0] === TEST_DOC_UUID) {
        return {
          rows: [
            {
              id: TEST_DOC_UUID,
              title: "Test Resume",
              document_type: "resume",
              raw_text: "Sample resume text content for testing purposes.",
              metadata: {},
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          ],
          rowCount: 1,
        };
      }

      return { rows: [], rowCount: 0 };
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
    mock.reset();
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  // --- 1. Request Validation & Malformed JSON Boundaries ---

  it("1. handles malformed JSON request bodies by returning 400 Bad Request", async () => {
    const res = await fetch(`${baseUrl}/search/chunks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: '{"query": "valid query", malformed_json: }',
    });

    assert.equal(res.status, 400);
    const body = (await res.json()) as { status: string; message: string };
    assert.equal(body.status, "error");
    assert.equal(body.message, "Malformed JSON payload in request body");
  });

  it("2. returns 404 for unmapped/unmatched routes in consistent JSON shape", async () => {
    const res = await fetch(`${baseUrl}/api/v1/unknown-endpoint`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ test: true }),
    });

    assert.equal(res.status, 404);
    const body = (await res.json()) as { status: string; message: string };
    assert.equal(body.status, "error");
    assert.equal(body.message, "Resource not found");
  });

  it("3. rejects missing or empty documentId on POST /resumes/analyze with 400", async () => {
    const resMissing = await fetch(`${baseUrl}/resumes/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(resMissing.status, 400);
    const bodyMissing = (await resMissing.json()) as { status: string; message: string };
    assert.equal(bodyMissing.status, "error");

    const resEmpty = await fetch(`${baseUrl}/resumes/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId: "   " }),
    });
    assert.equal(resEmpty.status, 400);
  });

  it("4. rejects invalid inputs on POST /jobs/compare with 400", async () => {
    const resMissingDoc = await fetch(`${baseUrl}/jobs/compare`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobDescription: "TypeScript engineer" }),
    });
    assert.equal(resMissingDoc.status, 400);

    const resMissingJob = await fetch(`${baseUrl}/jobs/compare`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId: TEST_DOC_UUID }),
    });
    assert.equal(resMissingJob.status, 400);
  });

  it("5. rejects invalid retrieval parameters on POST /resumes/:id/ask with 400", async () => {
    // 5a. Invalid topK (negative or float)
    const resInvalidTopK = await fetch(`${baseUrl}/resumes/${TEST_DOC_UUID}/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: "Find skills",
        topK: -3,
      }),
    });
    assert.equal(resInvalidTopK.status, 400);

    // 5b. Invalid maxDistanceThreshold (negative)
    const resInvalidThreshold = await fetch(`${baseUrl}/resumes/${TEST_DOC_UUID}/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: "Find skills",
        maxDistanceThreshold: -0.5,
      }),
    });
    assert.equal(resInvalidThreshold.status, 400);

    // 5c. Invalid metadataFilter (array instead of object)
    const resInvalidFilter = await fetch(`${baseUrl}/resumes/${TEST_DOC_UUID}/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: "Find skills",
        metadataFilter: ["invalid", "array"],
      }),
    });
    assert.equal(resInvalidFilter.status, 400);
  });

  // --- 2. Upload Endpoint Boundaries ---

  it("6. rejects POST /resumes with missing file with 400 Bad Request", async () => {
    const res = await fetch(`${baseUrl}/resumes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    assert.equal(res.status, 400);
    const body = (await res.json()) as { status: string; message: string };
    assert.equal(body.status, "error");
    assert.match(body.message, /No resume file provided/i);
  });

  it("7. rejects POST /resumes with unsupported file magic bytes with 415 Unsupported Media Type", async () => {
    const formData = new FormData();
    const fakePng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const blob = new Blob([fakePng], { type: "application/pdf" });
    formData.append("file", blob, "fake.pdf");

    const res = await fetch(`${baseUrl}/resumes`, {
      method: "POST",
      body: formData,
    });

    assert.equal(res.status, 415);
    const body = (await res.json()) as { status: string; message: string };
    assert.equal(body.status, "error");
    assert.match(body.message, /Unsupported or unidentifiable file type/i);
  });

  it("8. rejects POST /resumes with oversized file with 413 Payload Too Large", async () => {
    const formData = new FormData();
    const oversizedBuffer = Buffer.alloc(6 * 1024 * 1024);
    const blob = new Blob([oversizedBuffer], { type: "application/pdf" });
    formData.append("file", blob, "huge.pdf");

    const res = await fetch(`${baseUrl}/resumes`, {
      method: "POST",
      body: formData,
    });

    assert.equal(res.status, 413);
    const body = (await res.json()) as { status: string; message: string };
    assert.equal(body.status, "error");
    assert.match(body.message, /File size exceeds limit of 5MB/i);
  });

  // --- 3. Resource Not Found (404) ---

  it("9. returns 404 when requested documentId does not exist", async () => {
    const res = await fetch(`${baseUrl}/resumes/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId: "non-existent-doc-uuid" }),
    });

    assert.equal(res.status, 404);
    const body = (await res.json()) as { status: string; message: string };
    assert.equal(body.status, "error");
    assert.match(body.message, /Document with ID "non-existent-doc-uuid" not found/i);
  });

  // --- 4. Upstream AI Error (502) ---

  it("10. returns 502 Bad Gateway when upstream AI provider times out", async () => {
    shouldOllamaFail = true;

    try {
      const res = await fetch(`${baseUrl}/search/chunks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: "test query",
          documentId: TEST_DOC_UUID,
        }),
      });

      assert.equal(res.status, 502);
      const body = (await res.json()) as { status: string; message: string };
      assert.equal(body.status, "error");
      assert.equal(body.message, "AI service is currently unavailable or timed out");
    } finally {
      shouldOllamaFail = false;
    }
  });

  // --- 5. Unexpected Internal Errors (500) & Internal Leak Prevention ---

  it("11. returns safe 500 response without leaking stack traces or internal secrets", async () => {
    shouldDbFail = true;

    try {
      const res = await fetch(`${baseUrl}/resumes/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: TEST_DOC_UUID }),
      });

      assert.equal(res.status, 500);
      const rawText = await res.text();
      const body = JSON.parse(rawText) as Record<string, unknown>;

      assert.equal(body.status, "error");
      assert.equal(body.message, "An unexpected internal server error occurred");

      // Verify no internal leakage
      assert.equal(body.stack, undefined, "Stack trace must never be leaked to client");
      assert.ok(
        !rawText.includes("secret_db_password_123"),
        "Raw database error or secrets must never appear in response",
      );
      assert.ok(
        !rawText.includes("Unexpected database connection drop"),
        "Internal exception message must not be exposed",
      );
    } finally {
      shouldDbFail = false;
    }
  });

  // --- 6. Secret Redaction in Validation Responses ---

  it("12. never exposes submitted secret-looking values in Zod validation error responses", async () => {
    const sensitivePassword = "SecretPassword_MustNotLeak_987!";
    const sensitiveToken = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.sensitivePayload";
    const sensitiveValueInInvalidField = "sk-live-sensitive-api-token-99999";

    // 12a. Sensitive fields in payload with invalid type on another field
    const res1 = await fetch(`${baseUrl}/resumes/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        documentId: 12345, // invalid type
        apiKey: sensitiveToken,
        password: sensitivePassword,
      }),
    });

    assert.equal(res1.status, 400);
    const rawText1 = await res1.text();
    const body1 = JSON.parse(rawText1) as { status: string; message: string; issues?: unknown[] };

    assert.equal(body1.status, "error");
    assert.ok(
      !rawText1.includes(sensitivePassword),
      "Validation response must never expose submitted password",
    );
    assert.ok(
      !rawText1.includes(sensitiveToken),
      "Validation response must never expose submitted sensitive token",
    );

    // 12b. Sensitive string submitted directly into an invalid field (e.g. topK expects number)
    const res2 = await fetch(`${baseUrl}/search/chunks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: "Valid query",
        documentId: TEST_DOC_UUID,
        topK: sensitiveValueInInvalidField, // invalid type: expects number, receives string
      }),
    });

    assert.equal(res2.status, 400);
    const rawText2 = await res2.text();
    const body2 = JSON.parse(rawText2) as { status: string; message: string; issues?: unknown[] };

    assert.equal(body2.status, "error");
    assert.ok(
      !rawText2.includes(sensitiveValueInInvalidField),
      "Validation response must never expose the invalid field's submitted secret string",
    );
  });
});
