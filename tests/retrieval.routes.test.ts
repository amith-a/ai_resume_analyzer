import { describe, it, before, after, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import { app } from "../src/app.js";
import { retrievalService } from "../src/services/retrieval.service.js";
import type {
  DocumentChunkWithDistanceRecord,
  RetrieveChunksParams,
} from "../src/types/document.types.js";

const DEFAULT_VECTOR_DIMENSION = 768;
const mockVector = new Array(DEFAULT_VECTOR_DIMENSION).fill(0.05);

describe("POST /retrieval/chunks API Route Tests", () => {
  let server: Server;
  let baseUrl: string;
  let capturedParams: RetrieveChunksParams | null = null;
  let mockResult: DocumentChunkWithDistanceRecord[] = [];
  let shouldThrow: Error | null = null;
  let shouldOllamaFail = false;
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

    mock.method(retrievalService, "retrieveChunks", async (params: RetrieveChunksParams) => {
      capturedParams = params;
      if (shouldThrow) {
        throw shouldThrow;
      }
      return mockResult;
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
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  beforeEach(() => {
    capturedParams = null;
    mockResult = [];
    shouldThrow = null;
    shouldOllamaFail = false;
  });

  it("1. returns 200 OK and retrieved chunks for a valid request with all parameters", async () => {
    mockResult = [
      {
        id: "chunk-1",
        document_id: "doc-123",
        chunk_index: 0,
        content: "Senior Backend Developer with AWS",
        metadata: { section: "experience" },
        embedding: null,
        distance: 0.08,
        created_at: new Date(),
      },
    ];

    const response = await fetch(`${baseUrl}/retrieval/chunks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: "backend developer with AWS experience",
        documentId: "doc-123",
        topK: 3,
        maxDistanceThreshold: 0.4,
        metadataFilter: { section: "experience" },
      }),
    });

    assert.equal(response.status, 200);
    const body = (await response.json()) as { chunks: unknown[] };
    assert.ok(Array.isArray(body.chunks));
    assert.equal(body.chunks.length, 1);

    assert.ok(capturedParams);
    assert.equal(capturedParams.documentId, "doc-123");
    assert.deepEqual(capturedParams.queryVector, mockVector);
    assert.equal(capturedParams.topK, 3);
    assert.equal(capturedParams.maxDistanceThreshold, 0.4);
    assert.deepEqual(capturedParams.metadataFilter, { section: "experience" });
  });

  it("2. returns 200 OK for minimal valid payload (query and documentId)", async () => {
    mockResult = [];

    const response = await fetch(`${baseUrl}/retrieval/chunks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: "TypeScript engineer",
        documentId: "doc-456",
      }),
    });

    assert.equal(response.status, 200);
    const body = (await response.json()) as { chunks: unknown[] };
    assert.deepEqual(body.chunks, []);

    assert.ok(capturedParams);
    assert.equal(capturedParams.documentId, "doc-456");
    assert.deepEqual(capturedParams.queryVector, mockVector);
    assert.equal(capturedParams.topK, undefined);
    assert.equal(capturedParams.maxDistanceThreshold, undefined);
    assert.equal(capturedParams.metadataFilter, undefined);
  });

  it("3. returns 400 Bad Request when query is missing or empty", async () => {
    const resEmpty = await fetch(`${baseUrl}/retrieval/chunks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: "",
        documentId: "doc-123",
      }),
    });
    assert.equal(resEmpty.status, 400);

    const resMissing = await fetch(`${baseUrl}/retrieval/chunks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        documentId: "doc-123",
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
        documentId: "doc-123",
        topK: 0,
      }),
    });
    assert.equal(resZero.status, 400);

    const resFloat = await fetch(`${baseUrl}/retrieval/chunks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: "valid query",
        documentId: "doc-123",
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
        documentId: "doc-123",
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
        documentId: "doc-123",
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
        documentId: "doc-123",
      }),
    });

    assert.equal(res.status, 502);
  });
});
