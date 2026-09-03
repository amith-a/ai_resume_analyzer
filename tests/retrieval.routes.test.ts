import { describe, it, before, after, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import { app } from "../src/app.js";
import { pool } from "../src/config/db.js";

const DEFAULT_VECTOR_DIMENSION = 768;
const TEST_DOC_UUID = "11111111-1111-1111-1111-111111111111";
const mockVector = new Array(DEFAULT_VECTOR_DIMENSION).fill(0.05);

describe("POST /retrieval/chunks API Route Tests", () => {
  let server: Server;
  let baseUrl: string;
  let shouldOllamaFail = false;
  let capturedQueryText = "";
  let capturedQueryParams: unknown[] = [];
  let mockDbRows: unknown[] = [];
  const originalFetch = globalThis.fetch;

  before(async () => {
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

    mock.method(pool, "query", async (sql: string, params?: unknown[]) => {
      capturedQueryText = sql;
      capturedQueryParams = params ?? [];
      return {
        rows: mockDbRows,
        rowCount: mockDbRows.length,
      };
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

  beforeEach(() => {
    shouldOllamaFail = false;
    capturedQueryText = "";
    capturedQueryParams = [];
    mockDbRows = [];
  });

  it("1. returns 200 OK and retrieved chunks for a valid request with all parameters", async () => {
    mockDbRows = [
      {
        id: "chunk-1",
        document_id: TEST_DOC_UUID,
        chunk_index: 0,
        content: "Senior Backend Developer with AWS",
        metadata: { section: "experience" },
        embedding: `[${mockVector.join(",")}]`,
        distance: "0.08",
        created_at: new Date().toISOString(),
      },
    ];

    const response = await fetch(`${baseUrl}/retrieval/chunks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: "backend developer with AWS experience",
        documentId: TEST_DOC_UUID,
        topK: 3,
        maxDistanceThreshold: 0.4,
        metadataFilter: { section: "experience" },
      }),
    });

    assert.equal(response.status, 200);
    const body = (await response.json()) as { chunks: Array<{ id: string; distance: number }> };
    assert.ok(Array.isArray(body.chunks));
    assert.equal(body.chunks.length, 1);
    assert.equal(body.chunks[0].id, "chunk-1");
    assert.equal(body.chunks[0].distance, 0.08);

    assert.ok(capturedQueryText.includes("FROM document_chunks"));
    assert.equal(capturedQueryParams[0], TEST_DOC_UUID);
    assert.equal(capturedQueryParams[2], 3);
  });

  it("2. returns 200 OK for minimal valid payload (query and documentId)", async () => {
    mockDbRows = [];

    const response = await fetch(`${baseUrl}/retrieval/chunks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: "TypeScript engineer",
        documentId: TEST_DOC_UUID,
      }),
    });

    assert.equal(response.status, 200);
    const body = (await response.json()) as { chunks: unknown[] };
    assert.deepEqual(body.chunks, []);
    assert.equal(capturedQueryParams[0], TEST_DOC_UUID);
    assert.equal(capturedQueryParams[2], 5); // default topK
  });

  it("3. returns 400 Bad Request when query is missing or empty", async () => {
    const resEmpty = await fetch(`${baseUrl}/retrieval/chunks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: "",
        documentId: TEST_DOC_UUID,
      }),
    });
    assert.equal(resEmpty.status, 400);

    const resMissing = await fetch(`${baseUrl}/retrieval/chunks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        documentId: TEST_DOC_UUID,
      }),
    });
    assert.equal(resMissing.status, 400);
  });

  it("4. returns 400 Bad Request when documentId is missing or empty", async () => {
    const resEmpty = await fetch(`${baseUrl}/retrieval/chunks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: "valid query",
        documentId: "   ",
      }),
    });
    assert.equal(resEmpty.status, 400);
  });

  it("5. returns 400 Bad Request when topK is invalid (0, negative, float, string)", async () => {
    const resZero = await fetch(`${baseUrl}/retrieval/chunks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: "valid query",
        documentId: TEST_DOC_UUID,
        topK: 0,
      }),
    });
    assert.equal(resZero.status, 400);

    const resFloat = await fetch(`${baseUrl}/retrieval/chunks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: "valid query",
        documentId: TEST_DOC_UUID,
        topK: 3.5,
      }),
    });
    assert.equal(resFloat.status, 400);
  });

  it("6. returns 400 Bad Request when maxDistanceThreshold is invalid (negative, non-number)", async () => {
    const resNegative = await fetch(`${baseUrl}/retrieval/chunks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: "valid query",
        documentId: TEST_DOC_UUID,
        maxDistanceThreshold: -0.2,
      }),
    });
    assert.equal(resNegative.status, 400);
  });

  it("7. returns 400 Bad Request when metadataFilter is invalid (array, string primitive)", async () => {
    const resArray = await fetch(`${baseUrl}/retrieval/chunks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: "valid query",
        documentId: TEST_DOC_UUID,
        metadataFilter: ["section", "experience"],
      }),
    });
    assert.equal(resArray.status, 400);
  });

  it("8. maps UpstreamAIError to 502 Bad Gateway via centralized error middleware", async () => {
    shouldOllamaFail = true;

    const res = await fetch(`${baseUrl}/retrieval/chunks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: "valid query",
        documentId: TEST_DOC_UUID,
      }),
    });

    assert.equal(res.status, 502);
  });
});
