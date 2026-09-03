import { describe, it, before, after, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import { app } from "../src/app.js";
import { pool } from "../src/config/db.js";

const DEFAULT_VECTOR_DIMENSION = 768;
const mockVector = new Array(DEFAULT_VECTOR_DIMENSION).fill(0.05);

describe("POST /resumes/:id/ask Scoped RAG Integration Tests (Phase 12)", () => {
  let server: Server;
  let baseUrl: string;

  let shouldOllamaEmbedFail = false;
  let shouldOllamaChatFail = false;
  let capturedQuerySql = "";
  let capturedQueryParams: unknown[] = [];
  let mockRetrievedChunks: Array<{
    id: string;
    document_id: string;
    chunk_index: number;
    content: string;
    metadata: Record<string, unknown>;
    embedding: string;
    distance: string;
    created_at: string;
  }> = [];

  let mockOllamaChatAnswer =
    "Jane Doe is a Lead Engineer with extensive experience in distributed systems.";

  const originalFetch = globalThis.fetch;

  before(async () => {
    mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

      if (url.includes("/api/embed") || url.includes("/api/embeddings")) {
        if (shouldOllamaEmbedFail) {
          throw new Error("Ollama embedding timeout");
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

      if (url.includes("/api/chat") || url.includes(":11434")) {
        if (shouldOllamaChatFail) {
          throw new Error("Ollama chat generation failed");
        }
        return new Response(
          JSON.stringify({
            model: "qwen3:4b",
            message: {
              role: "assistant",
              content: JSON.stringify({
                answer: mockOllamaChatAnswer,
              }),
            },
            done: true,
          }) + "\n",
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      return originalFetch(input, init);
    });

    mock.method(pool, "query", async (sql: string, params?: unknown[]) => {
      capturedQuerySql = sql;
      capturedQueryParams = params ?? [];

      if (sql.includes("FROM document_chunks")) {
        return {
          rows: mockRetrievedChunks,
          rowCount: mockRetrievedChunks.length,
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

  beforeEach(() => {
    shouldOllamaEmbedFail = false;
    shouldOllamaChatFail = false;
    mockOllamaChatAnswer =
      "Jane Doe is a Lead Engineer with extensive experience in distributed systems.";
    capturedQuerySql = "";
    capturedQueryParams = [];
    mockRetrievedChunks = [
      {
        id: "chunk-uuid-1",
        document_id: "doc-uuid-123",
        chunk_index: 0,
        content: "Jane Doe - Lead Engineer with 10 years experience in distributed systems",
        metadata: { section: "experience" },
        embedding: `[${mockVector.join(",")}]`,
        distance: "0.05",
        created_at: new Date().toISOString(),
      },
    ];
  });

  it("1. returns 200 OK with grounded answer and tracked sources on valid documentId and query", async () => {
    const res = await fetch(`${baseUrl}/resumes/doc-uuid-123/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: "What is Jane's experience with distributed systems?",
      }),
    });

    assert.equal(res.status, 200);
    const json = (await res.json()) as {
      status: string;
      data: {
        answer: string;
        sources: Array<{
          id: string;
          chunkId: string;
          chunkIndex: number;
          documentId: string;
          content: string;
        }>;
      };
    };

    assert.equal(json.status, "success");
    assert.ok(json.data.answer.includes("Lead Engineer"));
    assert.equal(json.data.sources.length, 1);
    assert.equal(json.data.sources[0].id, "chunk-uuid-1");
    assert.equal(json.data.sources[0].chunkId, "chunk-uuid-1");
    assert.equal(json.data.sources[0].chunkIndex, 0);
    assert.equal(json.data.sources[0].documentId, "doc-uuid-123");
    assert.equal(
      json.data.sources[0].content,
      "Jane Doe - Lead Engineer with 10 years experience in distributed systems",
    );
  });

  it("2. enforces document isolation by passing :id as documentId strictly to retrieval", async () => {
    const targetDocId = "specific-doc-987";

    const res = await fetch(`${baseUrl}/resumes/${targetDocId}/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: "Check candidate skills",
      }),
    });

    assert.equal(res.status, 200);
    assert.ok(capturedQuerySql.includes("document_id = $1"));
    assert.equal(
      capturedQueryParams[0],
      targetDocId,
      "Retrieval must be strictly scoped to document ID parameter",
    );
  });

  it("3. returns grounding fallback with sources: [] when retrieval returns zero chunks", async () => {
    mockRetrievedChunks = [];

    const res = await fetch(`${baseUrl}/resumes/doc-uuid-123/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: "What is Jane's experience with Quantum Computing?",
      }),
    });

    assert.equal(res.status, 200);
    const json = (await res.json()) as {
      status: string;
      data: {
        answer: string;
        sources: unknown[];
      };
    };

    assert.equal(json.status, "success");
    assert.equal(
      json.data.answer,
      "The information is not available in the provided resume context.",
    );
    assert.deepEqual(json.data.sources, []);
  });

  it("4. returns 502 Bad Gateway when embedding retrieval fails", async () => {
    shouldOllamaEmbedFail = true;

    const res = await fetch(`${baseUrl}/resumes/doc-uuid-123/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: "Explain skills",
      }),
    });

    assert.equal(res.status, 502);
    const json = (await res.json()) as { status: string; message: string };
    assert.equal(json.status, "error");
    assert.ok(json.message.includes("AI service is currently unavailable"));
  });

  it("5. returns 502 Bad Gateway when LLM generation fails", async () => {
    shouldOllamaChatFail = true;

    const res = await fetch(`${baseUrl}/resumes/doc-uuid-123/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: "Explain skills",
      }),
    });

    assert.equal(res.status, 502);
    const json = (await res.json()) as { status: string; message: string };
    assert.equal(json.status, "error");
    assert.ok(json.message.includes("AI service is currently unavailable"));
  });

  it("6. returns 400 Bad Request when query field is missing or whitespace-only", async () => {
    const resMissing = await fetch(`${baseUrl}/resumes/doc-uuid-123/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(resMissing.status, 400);

    const resEmpty = await fetch(`${baseUrl}/resumes/doc-uuid-123/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: "   ",
      }),
    });
    assert.equal(resEmpty.status, 400);
  });

  it("7. returns grounding fallback with sources: [] when LLM generation returns an empty answer", async () => {
    mockOllamaChatAnswer = "";

    const res = await fetch(`${baseUrl}/resumes/doc-uuid-123/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: "What is Jane's experience with distributed systems?",
      }),
    });

    assert.equal(res.status, 200);
    const json = (await res.json()) as {
      status: string;
      data: {
        answer: string;
        sources: unknown[];
      };
    };

    assert.equal(json.status, "success");
    assert.equal(
      json.data.answer,
      "The information is not available in the provided resume context.",
    );
    assert.deepEqual(json.data.sources, []);
  });

  it("8. returns grounding fallback with sources: [] when LLM generation produces an ungrounded answer", async () => {
    mockOllamaChatAnswer =
      "Candidate specializes in quantum astrophysics and rocket propulsion with MATLAB.";

    const res = await fetch(`${baseUrl}/resumes/doc-uuid-123/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: "What is Jane's experience with distributed systems?",
      }),
    });

    assert.equal(res.status, 200);
    const json = (await res.json()) as {
      status: string;
      data: {
        answer: string;
        sources: unknown[];
      };
    };

    assert.equal(json.status, "success");
    assert.equal(
      json.data.answer,
      "The information is not available in the provided resume context.",
    );
    assert.deepEqual(json.data.sources, []);
  });
});
