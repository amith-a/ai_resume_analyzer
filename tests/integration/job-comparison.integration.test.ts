import { describe, it, before, after, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import { app } from "../../src/app.js";
import { pool } from "../../src/config/db.js";
import { jobComparisonPrompt } from "../../src/ai/prompts/job-comparison.prompt.js";
import type { JobComparisonOutput } from "../../src/ai/schemas/job-comparison.schema.js";
import { UpstreamAIError } from "../../src/errors/index.js";

const sampleValidComparison: JobComparisonOutput = {
  matchedSkills: ["TypeScript", "PostgreSQL", "Node.js"],
  missingSkills: ["Kubernetes", "AWS Lambda"],
  relevantExperience: [
    {
      role: "Senior Backend Engineer",
      company: "Acme Corp",
      years: 4,
      relevance: "Directly matches backend requirements using TypeScript and PostgreSQL.",
    },
  ],
  experienceGaps: [
    "Candidate lacks multi-region Kubernetes container orchestration experience in production.",
  ],
  relevantProjects: [
    {
      name: "Distributed Task Queue",
      relevance: "Demonstrates asynchronous system design using Redis and TypeScript.",
    },
  ],
  strengths: ["Strong TypeScript and relational database design background."],
  gaps: ["Missing required Kubernetes experience."],
  improvementSuggestions: ["Gain hands-on experience with Kubernetes and container deployment."],
  overallFit: "moderate",
};

const DEFAULT_VECTOR_DIMENSION = 768;
const mockVector = new Array(DEFAULT_VECTOR_DIMENSION).fill(0.05);

const mockStoredDocument = {
  id: "valid-doc-123",
  title: "resume.pdf",
  file_path: null,
  document_type: "resume",
  raw_text: "Jane Doe - Senior Backend Engineer - TypeScript PostgreSQL",
  metadata: { filename: "resume.pdf" },
  created_at: new Date(),
  updated_at: new Date(),
};

describe("POST /jobs/compare Integration Tests (JSON documentId + jobDescription Contract)", () => {
  let server: Server;
  let baseUrl: string;
  let capturedResumeText: string | null = null;
  let capturedJobDescription: string | null = null;
  let mockHandler: (input: {
    resumeText: string;
    jobDescription: string;
  }) => Promise<JobComparisonOutput>;

  const originalFetch = globalThis.fetch;

  before(async () => {
    // Intercept embedding endpoint calls
    mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

      if (url.includes("/api/embed") || url.includes("/api/embeddings")) {
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

    // Intercept prompt pipeline to observe inputs and supply mock output
    mock.method(jobComparisonPrompt, "pipe", () => {
      return {
        invoke: async (input: { resumeText: string; jobDescription: string }) => {
          capturedResumeText = input.resumeText;
          capturedJobDescription = input.jobDescription;
          return mockHandler(input);
        },
      } as any;
    });

    // Mock database queries to findDocumentById
    mock.method(pool, "query", async (sql: string, params?: unknown[]) => {
      if (sql.includes("FROM documents")) {
        const docId = params?.[0];
        if (docId === "valid-doc-123") {
          return {
            rows: [mockStoredDocument],
            rowCount: 1,
          };
        }
        if (docId === "empty-text-doc") {
          return {
            rows: [{ ...mockStoredDocument, id: "empty-text-doc", raw_text: "" }],
            rowCount: 1,
          };
        }
        return { rows: [], rowCount: 0 };
      }

      if (sql.includes("FROM document_chunks")) {
        const docId = params?.[0];
        if (docId === "valid-doc-123") {
          return {
            rows: [
              {
                id: "chunk-1",
                document_id: "valid-doc-123",
                chunk_index: 0,
                content: "Jane Doe - Senior Backend Engineer - TypeScript PostgreSQL",
                metadata: {},
                embedding: "[0.05, 0.05]",
                distance: "0.15",
                created_at: new Date().toISOString(),
              },
            ],
            rowCount: 1,
          };
        }
        return { rows: [], rowCount: 0 };
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
    capturedResumeText = null;
    capturedJobDescription = null;
    mockHandler = async () => sampleValidComparison;
  });

  it("1. returns 200 OK with structured JobComparisonOutput on valid documentId + jobDescription", async () => {
    const res = await fetch(`${baseUrl}/jobs/compare`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        documentId: "valid-doc-123",
        jobDescription: "Looking for a Senior Backend Engineer with TypeScript and PostgreSQL.",
      }),
    });

    assert.equal(res.status, 200);
    const json = (await res.json()) as {
      status: string;
      message: string;
      data: JobComparisonOutput;
    };
    assert.equal(json.status, "success");
    assert.equal(json.message, "Job description comparison completed successfully");
    assert.deepEqual(json.data, sampleValidComparison);
  });

  it("2. passes stored resume text from database directly to LLM without file extraction", async () => {
    const res = await fetch(`${baseUrl}/jobs/compare`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        documentId: "valid-doc-123",
        jobDescription: "Looking for a Senior Backend Engineer.",
      }),
    });

    assert.equal(res.status, 200);
    assert.ok(capturedResumeText !== null, "Prompt must receive resume text");
    assert.ok(
      capturedResumeText.includes("Jane Doe - Senior Backend Engineer - TypeScript PostgreSQL"),
      "Must match stored raw_text",
    );
    assert.equal(capturedJobDescription, "Looking for a Senior Backend Engineer.");
  });

  it("3. returns 400 Bad Request when documentId is missing", async () => {
    const res = await fetch(`${baseUrl}/jobs/compare`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jobDescription: "Valid job description text",
      }),
    });

    assert.equal(res.status, 400);
    const json = (await res.json()) as { status: string; message: string; issues: unknown[] };
    assert.equal(json.status, "error");
    assert.ok(json.message.includes("Document ID must be a non-empty string"));
    assert.ok(Array.isArray(json.issues));
  });

  it("4. returns 400 Bad Request when documentId is empty or whitespace-only", async () => {
    const resEmpty = await fetch(`${baseUrl}/jobs/compare`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        documentId: "",
        jobDescription: "Valid job description",
      }),
    });
    assert.equal(resEmpty.status, 400);

    const resWhitespace = await fetch(`${baseUrl}/jobs/compare`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        documentId: "   ",
        jobDescription: "Valid job description",
      }),
    });
    assert.equal(resWhitespace.status, 400);
  });

  it("5. returns 400 Bad Request when jobDescription is missing", async () => {
    const res = await fetch(`${baseUrl}/jobs/compare`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        documentId: "valid-doc-123",
      }),
    });

    assert.equal(res.status, 400);
    const json = (await res.json()) as { status: string; message: string; issues: unknown[] };
    assert.equal(json.status, "error");
    assert.ok(json.message.includes("Job description must be a non-empty string"));
  });

  it("6. returns 400 Bad Request when jobDescription is empty or whitespace-only", async () => {
    const resEmpty = await fetch(`${baseUrl}/jobs/compare`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        documentId: "valid-doc-123",
        jobDescription: "",
      }),
    });
    assert.equal(resEmpty.status, 400);

    const resWhitespace = await fetch(`${baseUrl}/jobs/compare`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        documentId: "valid-doc-123",
        jobDescription: "   ",
      }),
    });
    assert.equal(resWhitespace.status, 400);
  });

  it("7. returns 404 Not Found when documentId does not exist in database", async () => {
    const res = await fetch(`${baseUrl}/jobs/compare`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        documentId: "non-existent-doc-id",
        jobDescription: "Staff Engineer role requirements",
      }),
    });

    assert.equal(res.status, 404);
    const json = (await res.json()) as { status: string; message: string };
    assert.equal(json.status, "error");
    assert.ok(json.message.includes('Document with ID "non-existent-doc-id" not found'));
  });

  it("8. returns 422 Unprocessable Entity when stored document has empty or unavailable text", async () => {
    const res = await fetch(`${baseUrl}/jobs/compare`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        documentId: "empty-text-doc",
        jobDescription: "Staff Engineer role requirements",
      }),
    });

    assert.equal(res.status, 422);
    const json = (await res.json()) as { status: string; message: string };
    assert.equal(json.status, "error");
    assert.ok(json.message.includes("has no extracted text to compare"));
  });

  it("9. returns 502 Bad Gateway when LLM service encounters upstream failure/timeout", async () => {
    mockHandler = async () => {
      throw new UpstreamAIError("Ollama service timeout");
    };

    const res = await fetch(`${baseUrl}/jobs/compare`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        documentId: "valid-doc-123",
        jobDescription: "Requirements for Backend Engineer",
      }),
    });

    assert.equal(res.status, 502);
    const json = (await res.json()) as { status: string; message: string };
    assert.equal(json.status, "error");
    assert.equal(json.message, "AI service is currently unavailable or timed out");
  });

  it("10. returns 422 Unprocessable Entity when LLM output violates schema validation", async () => {
    mockHandler = async () => {
      return {
        ...sampleValidComparison,
        overallFit: "invalid-fit-value" as any,
      };
    };

    const res = await fetch(`${baseUrl}/jobs/compare`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        documentId: "valid-doc-123",
        jobDescription: "Requirements for Backend Engineer",
      }),
    });

    assert.equal(res.status, 422);
    const json = (await res.json()) as { status: string; message: string; issues: unknown[] };
    assert.equal(json.status, "error");
    assert.equal(json.message, "AI output failed schema validation");
    assert.ok(Array.isArray(json.issues));
  });

  it("11. never returns fallback or fabricated comparison data on failure", async () => {
    mockHandler = async () => {
      throw new Error("Fatal unrecoverable model crash");
    };

    const res = await fetch(`${baseUrl}/jobs/compare`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        documentId: "valid-doc-123",
        jobDescription: "Requirements for Backend Engineer",
      }),
    });

    const json = (await res.json()) as { data?: unknown };
    assert.equal(json.data, undefined, "Response must not contain data object on failure");
  });
});
