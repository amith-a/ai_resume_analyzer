import { describe, it, before, after, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import { app } from "../src/app.js";
import { pool } from "../src/config/db.js";
import type { ResumeAnalysis } from "../src/ai/schemas/resume-analysis.schema.js";

const mockValidAnalysis: ResumeAnalysis = {
  candidateSummary: "Lead Engineer with 10 years experience in distributed systems.",
  skills: ["Distributed Systems", "Cloud Architecture"],
  experience: [
    {
      company: "Acme Corp",
      role: "Lead Engineer",
      startYear: 2020,
      endYear: null,
      description: "Led scalable microservices architecture.",
    },
  ],
  education: [
    {
      institution: "MIT",
      degree: "B.S.",
      field: "Computer Science",
      startYear: 2010,
      endYear: 2014,
    },
  ],
  projects: [
    {
      name: "Distributed Cache",
      description: "In-memory cache built with Node.js.",
      technologies: ["Node.js", "TypeScript"],
    },
  ],
  technologies: ["Node.js", "TypeScript", "Docker"],
  certifications: ["AWS Certified Solutions Architect"],
  strengths: ["Architecture", "System Design"],
  missingOrUnclear: [],
};

const mockStoredDocument = {
  id: "valid-doc-123",
  title: "resume.pdf",
  file_path: null,
  document_type: "resume",
  raw_text: "Jane Doe - Lead Engineer with 10 years experience in distributed systems.",
  metadata: { filename: "resume.pdf" },
  created_at: new Date(),
  updated_at: new Date(),
};

describe("POST /resumes/analyze Structured Analysis Integration Tests (JSON documentId Contract)", () => {
  let server: Server;
  let baseUrl: string;
  let capturedNormalizedText: string | null = null;
  let ollamaHandler: (requestBody: string) => Promise<Response> | Response;

  const originalFetch = globalThis.fetch;

  before(async () => {
    // Intercept LLM calls to local Ollama
    mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

      if (url.includes("/api/chat") || url.includes(":11434")) {
        const bodyStr = typeof init?.body === "string" ? init.body : "";
        try {
          const parsed = JSON.parse(bodyStr) as {
            messages?: Array<{ role: string; content: string }>;
          };
          const humanMsg = parsed.messages?.find((m) => m.role === "user");
          if (humanMsg && typeof humanMsg.content === "string") {
            const match = humanMsg.content.match(/<resume_text>\n([\s\S]*?)\n<\/resume_text>/);
            if (match) {
              capturedNormalizedText = match[1];
            }
          }
        } catch {
          // pass
        }
        return ollamaHandler(bodyStr);
      }

      return originalFetch(input, init);
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
    capturedNormalizedText = null;
    ollamaHandler = async () =>
      new Response(
        JSON.stringify({
          model: "qwen3:4b",
          message: {
            role: "assistant",
            content: JSON.stringify(mockValidAnalysis),
          },
          done: true,
        }) + "\n",
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
  });

  it("1. returns 200 OK with structured ResumeAnalysis on valid documentId", async () => {
    const res = await fetch(`${baseUrl}/resumes/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId: "valid-doc-123" }),
    });

    assert.equal(res.status, 200);
    const json = (await res.json()) as { status: string; message: string; data: ResumeAnalysis };
    assert.equal(json.status, "success");
    assert.equal(json.message, "Resume analyzed successfully");
    assert.deepEqual(json.data, mockValidAnalysis);
  });

  it("2. passes stored resume text from database to LLM prompt without re-extracting", async () => {
    const res = await fetch(`${baseUrl}/resumes/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId: "valid-doc-123" }),
    });

    assert.equal(res.status, 200);
    assert.ok(capturedNormalizedText !== null, "LLM must receive text from stored document");
    assert.ok(
      capturedNormalizedText.includes("Jane Doe - Lead Engineer with 10 years experience"),
      "Must match stored raw_text",
    );
  });

  it("3. returns 400 Bad Request when documentId is missing from request body", async () => {
    const res = await fetch(`${baseUrl}/resumes/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    assert.equal(res.status, 400);
    const json = (await res.json()) as { status: string; message: string; issues: unknown[] };
    assert.equal(json.status, "error");
    assert.ok(json.message.includes("Document ID must be a non-empty string"));
    assert.ok(Array.isArray(json.issues));
  });

  it("4. returns 400 Bad Request when documentId is empty or whitespace-only", async () => {
    const resEmpty = await fetch(`${baseUrl}/resumes/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId: "" }),
    });
    assert.equal(resEmpty.status, 400);

    const resWhitespace = await fetch(`${baseUrl}/resumes/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId: "    " }),
    });
    assert.equal(resWhitespace.status, 400);
  });

  it("5. returns 400 Bad Request when documentId is not a string", async () => {
    const res = await fetch(`${baseUrl}/resumes/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId: 12345 }),
    });

    assert.equal(res.status, 400);
    const json = (await res.json()) as { status: string; message: string };
    assert.equal(json.status, "error");
  });

  it("6. returns 404 Not Found when documentId does not exist in database", async () => {
    const res = await fetch(`${baseUrl}/resumes/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId: "non-existent-doc-uuid" }),
    });

    assert.equal(res.status, 404);
    const json = (await res.json()) as { status: string; message: string };
    assert.equal(json.status, "error");
    assert.ok(json.message.includes('Document with ID "non-existent-doc-uuid" not found'));
  });

  it("7. returns 422 Unprocessable Entity when stored document has no extracted text", async () => {
    const res = await fetch(`${baseUrl}/resumes/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId: "empty-text-doc" }),
    });

    assert.equal(res.status, 422);
    const json = (await res.json()) as { status: string; message: string };
    assert.equal(json.status, "error");
    assert.ok(json.message.includes("has no extracted text to analyze"));
  });

  it("8. returns 502 Bad Gateway when AI service encounters upstream failure/timeout", async () => {
    ollamaHandler = async () => {
      throw new Error("Ollama connection refused at 11434");
    };

    const res = await fetch(`${baseUrl}/resumes/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId: "valid-doc-123" }),
    });

    assert.equal(res.status, 502);
    const json = (await res.json()) as { status: string; message: string };
    assert.equal(json.status, "error");
    assert.equal(json.message, "AI service is currently unavailable or timed out");
  });

  it("9. returns 422 Unprocessable Entity when LLM output violates schema validation", async () => {
    ollamaHandler = async () =>
      new Response(
        JSON.stringify({
          model: "qwen3:4b",
          message: {
            role: "assistant",
            content: JSON.stringify({
              candidateSummary: 12345, // invalid primitive type
            }),
          },
          done: true,
        }) + "\n",
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );

    const res = await fetch(`${baseUrl}/resumes/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId: "valid-doc-123" }),
    });

    assert.equal(res.status, 422);
    const json = (await res.json()) as { status: string; message: string; issues: unknown[] };
    assert.equal(json.status, "error");
    assert.equal(json.message, "AI output failed schema validation");
    assert.ok(Array.isArray(json.issues));
  });

  it("10. never returns fallback or fabricated analysis data on failure", async () => {
    ollamaHandler = async () => {
      throw new Error("Fatal crash in Ollama server");
    };

    const res = await fetch(`${baseUrl}/resumes/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId: "valid-doc-123" }),
    });

    const json = (await res.json()) as { data?: unknown };
    assert.equal(json.data, undefined, "Response must not contain data object on failure");
  });
});
