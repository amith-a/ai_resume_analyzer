import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import type { Server, IncomingMessage, ServerResponse } from "node:http";
import { EventEmitter } from "node:events";
import { Writable } from "node:stream";
import { pinoHttp } from "pino-http";
import { RunnableLambda } from "@langchain/core/runnables";
import { app } from "../src/app.js";
import { pinoHttpOptions } from "../src/middlewares/http-logger.middleware.js";
import { createLogger, logger, getRequestId, requestContextStorage } from "../src/config/logger.js";
import { extractTextFromDocument } from "../src/services/extractor.service.js";
import { analyzeResume } from "../src/services/resume-analyzer.service.js";
import { compareJobDescription } from "../src/services/job-comparison.service.js";
import { generateRagAnswer } from "../src/services/rag-generation.service.js";
import {
  embedText,
  embedChunks,
  type EmbeddingsClient,
} from "../src/services/embedding.service.js";
import {
  insertDocument,
  insertDocumentChunks,
  findDocumentById,
  findDocumentChunksByDocumentId,
  deleteDocumentById,
  findChunksByDocumentIdOrderedBySimilarity,
  type Queryable,
} from "../src/repositories/document.repository.js";
import { UpstreamAIError } from "../src/errors/index.js";

/**
 * In-memory writable stream that collects log lines as JSON objects.
 */
class MemoryLogStream extends Writable {
  public lines: Record<string, unknown>[] = [];
  public raw: string[] = [];

  _write(chunk: Buffer, _encoding: string, callback: () => void) {
    const str = chunk.toString();
    this.raw.push(str);
    for (const line of str.split("\n")) {
      const trimmed = line.trim();
      if (trimmed) {
        try {
          this.lines.push(JSON.parse(trimmed));
        } catch {
          // ignore non-json line
        }
      }
    }
    callback();
  }
}

describe("Observability Tests (Phase 14 — Block 6)", () => {
  let server: Server;
  let baseUrl: string;

  before(async () => {
    await new Promise<void>((resolve) => {
      server = app.listen(0, "127.0.0.1", () => {
        const addr = server.address();
        if (addr && typeof addr === "object") {
          baseUrl = `http://127.0.0.1:${addr.port}`;
        }
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  // --- 1. Logger Creation & Configuration ---

  describe("1. Logger Creation & Configuration", () => {
    it("1.1 creates a logger instance with configured level and ISO timestamp", () => {
      const mem = new MemoryLogStream();
      const testLogger = createLogger({ level: "debug" }, mem);

      testLogger.debug({ operation: "test_debug" }, "Debug log message");

      assert.equal(mem.lines.length, 1);
      const entry = mem.lines[0];
      assert.equal(entry.level, "debug");
      assert.equal(entry.operation, "test_debug");
      assert.equal(entry.msg, "Debug log message");
      assert.ok(typeof entry.time === "string");
      assert.match(entry.time as string, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it("1.2 redacts sensitive fields (passwords, tokens, resumeText) automatically", () => {
      const mem = new MemoryLogStream();
      const testLogger = createLogger({ level: "info" }, mem);

      testLogger.info(
        {
          operation: "auth_op",
          password: "SuperSecretPassword123!",
          token: "Bearer jwt-secret-token",
          resumeText: "Confidential resume info",
          safeId: "candidate-uuid-123",
        },
        "User action performed",
      );

      assert.equal(mem.lines.length, 1);
      const entry = mem.lines[0];
      assert.equal(entry.safeId, "candidate-uuid-123");
      assert.equal("password" in entry, false, "password must be redacted");
      assert.equal("token" in entry, false, "token must be redacted");
      assert.equal("resumeText" in entry, false, "resumeText must be redacted");
      assert.ok(!mem.raw.join(" ").includes("SuperSecretPassword123!"));
    });
  });

  // --- 2. Request ID Generation & Propagation ---

  describe("2. Request ID Generation & Propagation", () => {
    it("2.1 generates a new UUID request ID when incoming request does not provide one", async () => {
      const res = await fetch(`${baseUrl}/health`);
      assert.equal(res.status, 200);

      const resRequestId = res.headers.get("x-request-id");
      assert.ok(resRequestId, "Response must contain x-request-id header");
      // Verify UUID structure
      assert.match(resRequestId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    it("2.2 preserves and reuses client-supplied x-request-id", async () => {
      const customId = "client-correlation-uuid-999";
      const res = await fetch(`${baseUrl}/health`, {
        headers: { "x-request-id": customId },
      });
      assert.equal(res.status, 200);
      assert.equal(res.headers.get("x-request-id"), customId);
    });

    it("2.3 makes requestId available to downstream code via AsyncLocalStorage", async () => {
      let capturedId: string | undefined;

      await new Promise<void>((resolve) => {
        requestContextStorage.run({ requestId: "async-test-id-456" }, () => {
          capturedId = getRequestId();
          resolve();
        });
      });

      assert.equal(capturedId, "async-test-id-456");
    });
  });

  // --- 3. Request ID in Response Header ---

  describe("3. Request ID Response Header", () => {
    it("3.1 returns x-request-id header on both success and error responses", async () => {
      // 404 response
      const notFoundRes = await fetch(`${baseUrl}/non-existent-endpoint`);
      assert.equal(notFoundRes.status, 404);
      assert.ok(notFoundRes.headers.get("x-request-id"));

      // 400 response
      const badReqRes = await fetch(`${baseUrl}/resumes/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      assert.equal(badReqRes.status, 400);
      assert.ok(badReqRes.headers.get("x-request-id"));
    });
  });

  // --- 4. Request Logging ---

  describe("4. Request Logging", () => {
    it("4.1 strips sensitive query parameters from logged request URLs", () => {
      const mem = new MemoryLogStream();
      const testLogger = createLogger({ level: "info" }, mem);
      const testHttp = pinoHttp({
        ...pinoHttpOptions,
        logger: testLogger,
      });

      const req = {
        method: "GET",
        url: "/health?token=secret_query_param_token_999",
        headers: {},
      } as unknown as IncomingMessage;

      const res = new EventEmitter() as unknown as ServerResponse & {
        statusCode: number;
        setHeader: (k: string, v: string | number | readonly string[]) => ServerResponse;
        getHeader: (k: string) => string;
      };
      res.statusCode = 200;
      const headers: Record<string, string> = {};
      res.setHeader = (k: string, v: string | number | readonly string[]) => {
        headers[k.toLowerCase()] = String(v);
        return res;
      };
      res.getHeader = (k: string) => headers[k.toLowerCase()];

      testHttp(req, res);
      res.emit("finish");

      assert.equal(mem.lines.length, 1);
      const entry = mem.lines[0];
      const reqData = entry.req as { url?: string };
      assert.equal(reqData.url, "/health");
      assert.ok(!JSON.stringify(entry).includes("secret_query_param_token_999"));
    });

    it("4.2 logs structured durationMs and requestId on completed HTTP requests", () => {
      const mem = new MemoryLogStream();
      const testLogger = createLogger({ level: "info" }, mem);
      const testHttp = pinoHttp({
        ...pinoHttpOptions,
        logger: testLogger,
      });

      const req = {
        method: "GET",
        url: "/health",
        headers: { "x-request-id": "custom-req-id-777" },
      } as unknown as IncomingMessage;

      const res = new EventEmitter() as unknown as ServerResponse & {
        statusCode: number;
        setHeader: (k: string, v: string | number | readonly string[]) => ServerResponse;
        getHeader: (k: string) => string;
      };
      res.statusCode = 200;
      const headers: Record<string, string> = {};
      res.setHeader = (k: string, v: string | number | readonly string[]) => {
        headers[k.toLowerCase()] = String(v);
        return res;
      };
      res.getHeader = (k: string) => headers[k.toLowerCase()];

      testHttp(req, res);
      res.emit("finish");

      assert.equal(mem.lines.length, 1);
      const entry = mem.lines[0];
      assert.equal(entry.requestId, "custom-req-id-777");
      assert.ok(typeof entry.durationMs === "number" && (entry.durationMs as number) >= 0);
      assert.match(entry.msg as string, /GET \/health 200 in \d+ms/);
    });
  });

  // --- 5. AI Operations Latency Tracking ---

  describe("5. AI Operations Latency Tracking", () => {
    it("5.1 analyzeResume records operation, durationMs, and success status", async () => {
      const loggedEvents: Record<string, unknown>[] = [];
      const originalLoggerInfo = logger.info.bind(logger);

      logger.info = ((...args: unknown[]) => {
        if (typeof args[0] === "object" && args[0] !== null) {
          loggedEvents.push(args[0] as Record<string, unknown>);
        }
        return true;
      }) as typeof logger.info;

      const mockModel = new RunnableLambda({
        func: async () => ({
          candidateSummary: "Experienced engineer",
          skills: ["TypeScript"],
          experience: [],
          education: [],
          projects: [],
          technologies: ["Node.js"],
          certifications: [],
          strengths: ["Problem solving"],
          missingOrUnclear: [],
        }),
      });

      try {
        await analyzeResume("Valid resume text for candidate", mockModel);

        const aiEvent = loggedEvents.find((e) => e.operation === "ai_resume_analysis");
        assert.ok(aiEvent, "Must record ai_resume_analysis log event");
        assert.equal(aiEvent.status, "success");
        assert.ok(typeof aiEvent.durationMs === "number" && (aiEvent.durationMs as number) >= 0);
        assert.ok(aiEvent.model);
      } finally {
        logger.info = originalLoggerInfo;
      }
    });

    it("5.2 compareJobDescription records operation, durationMs, and success status", async () => {
      const loggedEvents: Record<string, unknown>[] = [];
      const originalLoggerInfo = logger.info.bind(logger);

      logger.info = ((...args: unknown[]) => {
        if (typeof args[0] === "object" && args[0] !== null) {
          loggedEvents.push(args[0] as Record<string, unknown>);
        }
        return true;
      }) as typeof logger.info;

      const mockModel = new RunnableLambda({
        func: async () => ({
          matchedSkills: ["TypeScript"],
          missingSkills: ["Go"],
          relevantExperience: [],
          experienceGaps: [],
          relevantProjects: [],
          strengths: ["Strong backend experience"],
          gaps: ["No Go experience"],
          improvementSuggestions: ["Learn Go"],
          overallFit: "moderate" as const,
        }),
      });

      try {
        await compareJobDescription(
          "Valid resume text with TypeScript",
          "Looking for TypeScript and Go developer",
          mockModel,
        );

        const aiEvent = loggedEvents.find((e) => e.operation === "ai_job_comparison");
        assert.ok(aiEvent, "Must record ai_job_comparison log event");
        assert.equal(aiEvent.status, "success");
        assert.ok(typeof aiEvent.durationMs === "number" && (aiEvent.durationMs as number) >= 0);
        assert.ok(aiEvent.model);
      } finally {
        logger.info = originalLoggerInfo;
      }
    });

    it("5.3 generateRagAnswer records operation, durationMs, and success status", async () => {
      const loggedEvents: Record<string, unknown>[] = [];
      const originalLoggerInfo = logger.info.bind(logger);

      logger.info = ((...args: unknown[]) => {
        if (typeof args[0] === "object" && args[0] !== null) {
          loggedEvents.push(args[0] as Record<string, unknown>);
        }
        return true;
      }) as typeof logger.info;

      const mockModel = new RunnableLambda({
        func: async () => ({
          answer: "Jane Doe has 5 years of experience with Node.js.",
        }),
      });

      try {
        await generateRagAnswer(
          { query: "How many years of Node.js?", context: "Jane has 5 years of Node.js" },
          { modelOverride: mockModel },
        );

        const aiEvent = loggedEvents.find((e) => e.operation === "ai_rag_answer");
        assert.ok(aiEvent, "Must record ai_rag_answer log event");
        assert.equal(aiEvent.status, "success");
        assert.ok(typeof aiEvent.durationMs === "number" && (aiEvent.durationMs as number) >= 0);
      } finally {
        logger.info = originalLoggerInfo;
      }
    });

    it("5.4 embedText and embedChunks record operation, dimension/count, durationMs, and success status", async () => {
      const loggedEvents: Record<string, unknown>[] = [];
      const originalLoggerInfo = logger.info.bind(logger);

      logger.info = ((...args: unknown[]) => {
        if (typeof args[0] === "object" && args[0] !== null) {
          loggedEvents.push(args[0] as Record<string, unknown>);
        }
        return true;
      }) as typeof logger.info;

      const mockClient: EmbeddingsClient = {
        embedQuery: async () => [0.1, 0.2, 0.3],
        embedDocuments: async (texts) => texts.map(() => [0.1, 0.2, 0.3]),
      };

      try {
        await embedText("Sample text for embedding", mockClient);
        await embedChunks(["Chunk 1", "Chunk 2"], mockClient);

        const singleEvent = loggedEvents.find((e) => e.operation === "ai_embed_text");
        assert.ok(singleEvent, "Must record ai_embed_text event");
        assert.equal(singleEvent.status, "success");
        assert.equal(singleEvent.dimension, 3);
        assert.ok(typeof singleEvent.durationMs === "number");

        const batchEvent = loggedEvents.find((e) => e.operation === "ai_embed_chunks");
        assert.ok(batchEvent, "Must record ai_embed_chunks event");
        assert.equal(batchEvent.status, "success");
        assert.equal(batchEvent.chunkCount, 2);
        assert.ok(typeof batchEvent.durationMs === "number");
      } finally {
        logger.info = originalLoggerInfo;
      }
    });
  });

  // --- 6. AI Failures Safe Metadata Tracking ---

  describe("6. AI Failures Safe Metadata Tracking", () => {
    it("6.1 records safe errorType and durationMs without leaking prompts or resume content on failure", async () => {
      const loggedErrors: Record<string, unknown>[] = [];
      const originalLoggerError = logger.error.bind(logger);

      logger.error = ((...args: unknown[]) => {
        if (typeof args[0] === "object" && args[0] !== null) {
          loggedErrors.push(args[0] as Record<string, unknown>);
        }
        return true;
      }) as typeof logger.error;

      const sensitivePromptContent = "CONFIDENTIAL_DATA_CANNOT_LEAK_12345";
      const failingClient: EmbeddingsClient = {
        embedQuery: async () => {
          throw new Error("Connection refused to Ollama server");
        },
      };

      try {
        await assert.rejects(async () => {
          await embedText(`Text with ${sensitivePromptContent}`, failingClient);
        });

        const errorEvent = loggedErrors.find((e) => e.operation === "ai_embed_text");
        assert.ok(errorEvent, "Must log ai_embed_text failure event");
        assert.equal(errorEvent.status, "error");
        assert.equal(errorEvent.errorType, "Error");
        assert.ok(typeof errorEvent.durationMs === "number");

        // Verify sensitive content is not present in logged error fields
        const stringified = JSON.stringify(errorEvent);
        assert.ok(!stringified.includes(sensitivePromptContent));
      } finally {
        logger.error = originalLoggerError;
      }
    });
  });

  // --- 7. Database Operations Timing & Error Tracking ---

  describe("7. Database Operations Timing & Error Tracking", () => {
    it("7.1 records operation name, durationMs, and success on repository query", async () => {
      const loggedEvents: Record<string, unknown>[] = [];
      const originalLoggerInfo = logger.info.bind(logger);

      logger.info = ((...args: unknown[]) => {
        if (typeof args[0] === "object" && args[0] !== null) {
          loggedEvents.push(args[0] as Record<string, unknown>);
        }
        return true;
      }) as typeof logger.info;

      const mockQueryable: Queryable = {
        query: async () => ({
          rows: [
            {
              id: "doc-uuid-1",
              title: "Test Resume",
              file_path: null,
              document_type: "resume",
              raw_text: "Sample text",
              metadata: {},
              created_at: new Date(),
              updated_at: new Date(),
            },
          ],
          rowCount: 1,
        }),
      } as unknown as Queryable;

      try {
        const doc = await findDocumentById("doc-uuid-1", mockQueryable);
        assert.equal(doc?.id, "doc-uuid-1");

        const dbEvent = loggedEvents.find((e) => e.operation === "db_find_document_by_id");
        assert.ok(dbEvent, "Must log db_find_document_by_id event");
        assert.equal(dbEvent.status, "success");
        assert.ok(typeof dbEvent.durationMs === "number" && (dbEvent.durationMs as number) >= 0);
      } finally {
        logger.info = originalLoggerInfo;
      }
    });

    it("7.2 records operation name, durationMs, and errorType on repository failure", async () => {
      const loggedErrors: Record<string, unknown>[] = [];
      const originalLoggerError = logger.error.bind(logger);

      logger.error = ((...args: unknown[]) => {
        if (typeof args[0] === "object" && args[0] !== null) {
          loggedErrors.push(args[0] as Record<string, unknown>);
        }
        return true;
      }) as typeof logger.error;

      const failingQueryable: Queryable = {
        query: async () => {
          throw new Error("PostgreSQL connection terminated unexpectedly");
        },
      } as unknown as Queryable;

      try {
        await assert.rejects(async () => {
          await deleteDocumentById("doc-uuid-1", failingQueryable);
        });

        const dbError = loggedErrors.find((e) => e.operation === "db_delete_document_by_id");
        assert.ok(dbError, "Must log db_delete_document_by_id error event");
        assert.equal(dbError.status, "error");
        assert.equal(dbError.errorType, "Error");
        assert.ok(typeof dbError.durationMs === "number");
      } finally {
        logger.error = originalLoggerError;
      }
    });

    it("7.3 records operation name and timing for insertDocument", async () => {
      const loggedEvents: Record<string, unknown>[] = [];
      const originalLoggerInfo = logger.info.bind(logger);

      logger.info = ((...args: unknown[]) => {
        if (typeof args[0] === "object" && args[0] !== null) {
          loggedEvents.push(args[0] as Record<string, unknown>);
        }
        return true;
      }) as typeof logger.info;

      const mockQueryable: Queryable = {
        query: async () => ({
          rows: [
            {
              id: "new-doc-1",
              title: "Title",
              file_path: null,
              document_type: "resume",
              raw_text: "text",
              metadata: {},
              created_at: new Date(),
              updated_at: new Date(),
            },
          ],
          rowCount: 1,
        }),
      } as unknown as Queryable;

      try {
        const doc = await insertDocument(
          { title: "Test Doc", document_type: "resume", raw_text: "sample" },
          mockQueryable,
        );
        assert.equal(doc.id, "new-doc-1");
        const event = loggedEvents.find((e) => e.operation === "db_insert_document");
        assert.ok(event);
        assert.equal(event.status, "success");
      } finally {
        logger.info = originalLoggerInfo;
      }
    });

    it("7.4 records operation name, chunkCount, and timing for insertDocumentChunks", async () => {
      const loggedEvents: Record<string, unknown>[] = [];
      const originalLoggerInfo = logger.info.bind(logger);

      logger.info = ((...args: unknown[]) => {
        if (typeof args[0] === "object" && args[0] !== null) {
          loggedEvents.push(args[0] as Record<string, unknown>);
        }
        return true;
      }) as typeof logger.info;

      const mockQueryable: Queryable = {
        query: async () => ({
          rows: [
            {
              id: "chunk-1",
              document_id: "doc-1",
              chunk_index: 0,
              content: "Chunk text",
              metadata: {},
              embedding: null,
              created_at: new Date(),
            },
          ],
          rowCount: 1,
        }),
      } as unknown as Queryable;

      try {
        const chunks = await insertDocumentChunks(
          [{ document_id: "doc-1", chunk_index: 0, content: "Chunk text", embedding: null }],
          mockQueryable,
        );
        assert.equal(chunks.length, 1);
        const event = loggedEvents.find((e) => e.operation === "db_insert_chunks");
        assert.ok(event);
        assert.equal(event.chunkCount, 1);
      } finally {
        logger.info = originalLoggerInfo;
      }
    });

    it("7.5 records operation name and timing for findDocumentChunksByDocumentId", async () => {
      const loggedEvents: Record<string, unknown>[] = [];
      const originalLoggerInfo = logger.info.bind(logger);

      logger.info = ((...args: unknown[]) => {
        if (typeof args[0] === "object" && args[0] !== null) {
          loggedEvents.push(args[0] as Record<string, unknown>);
        }
        return true;
      }) as typeof logger.info;

      const mockQueryable: Queryable = {
        query: async () => ({
          rows: [],
          rowCount: 0,
        }),
      } as unknown as Queryable;

      try {
        await findDocumentChunksByDocumentId("doc-1", mockQueryable);
        const event = loggedEvents.find((e) => e.operation === "db_find_chunks_by_document_id");
        assert.ok(event);
        assert.equal(event.status, "success");
      } finally {
        logger.info = originalLoggerInfo;
      }
    });

    it("7.6 records operation name, topK, and timing for findChunksByDocumentIdOrderedBySimilarity", async () => {
      const loggedEvents: Record<string, unknown>[] = [];
      const originalLoggerInfo = logger.info.bind(logger);

      logger.info = ((...args: unknown[]) => {
        if (typeof args[0] === "object" && args[0] !== null) {
          loggedEvents.push(args[0] as Record<string, unknown>);
        }
        return true;
      }) as typeof logger.info;

      const mockQueryable: Queryable = {
        query: async () => ({
          rows: [],
          rowCount: 0,
        }),
      } as unknown as Queryable;

      const dummyVector = new Array(768).fill(0.1);

      try {
        await findChunksByDocumentIdOrderedBySimilarity(
          "doc-1",
          dummyVector,
          5,
          undefined,
          undefined,
          mockQueryable,
        );
        const event = loggedEvents.find((e) => e.operation === "db_vector_similarity_search");
        assert.ok(event);
        assert.equal(event.topK, 5);
        assert.equal(event.status, "success");
      } finally {
        logger.info = originalLoggerInfo;
      }
    });
  });

  // --- 8. Existing API Error Responses Unchanged ---

  describe("8. Existing API Error Responses Contract Unchanged", () => {
    it("8.1 preserves 404 response structure", async () => {
      const res = await fetch(`${baseUrl}/api/v1/non-existent-route`);
      assert.equal(res.status, 404);
      const json = (await res.json()) as Record<string, unknown>;
      assert.equal(json.status, "error");
      assert.ok(typeof json.message === "string");
      assert.ok(res.headers.get("x-request-id"));
    });

    it("8.2 preserves 400 validation error response structure", async () => {
      const res = await fetch(`${baseUrl}/resumes/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: "" }),
      });

      assert.equal(res.status, 400);
      const json = (await res.json()) as Record<string, unknown>;
      assert.equal(json.status, "error");
      assert.ok(json.issues);
    });
  });

  // --- 9. Existing AI Timeout Behavior Unchanged ---

  describe("9. Existing AI Timeout Behavior Unchanged", () => {
    it("9.1 embedText maps bounded timeout to UpstreamAIError", async () => {
      const hangingClient: EmbeddingsClient = {
        embedQuery: () => new Promise<never>(() => {}), // never resolves
      };

      await assert.rejects(
        async () => {
          await embedText("Test text", hangingClient, 10); // 10ms timeout
        },
        (err: unknown) => {
          assert.ok(err instanceof UpstreamAIError);
          return true;
        },
      );
    });
  });

  // --- 10. Document Extraction Latency Tracking ---

  describe("10. Document Extraction Latency Tracking", () => {
    it("10.1 extractTextFromDocument records operation, status, durationMs, and textLength on successful extraction", async () => {
      const loggedEvents: Record<string, unknown>[] = [];
      const originalLoggerInfo = logger.info.bind(logger);

      logger.info = ((...args: unknown[]) => {
        if (typeof args[0] === "object" && args[0] !== null) {
          loggedEvents.push(args[0] as Record<string, unknown>);
        }
        return true;
      }) as typeof logger.info;

      // Minimal valid PDF buffer containing extractable text
      const validPdf = Buffer.from(
        "%PDF-1.4\n" +
          "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n" +
          "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n" +
          "3 0 obj\n<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n" +
          "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n" +
          "5 0 obj\n<< /Length 44 >>\nstream\nBT /F1 12 Tf 72 712 Td (John Doe Resume) Tj ET\nendstream\nendobj\nxref\n0 6\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000216 00000 n \n0000000293 00000 n \ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n386\n%%EOF",
      );

      try {
        const result = await extractTextFromDocument(validPdf, "application/pdf");
        assert.ok(result.text.includes("John Doe Resume"));

        const extractEvent = loggedEvents.find((e) => e.operation === "text_extraction");
        assert.ok(extractEvent, "Must record text_extraction log event");
        assert.equal(extractEvent.status, "success");
        assert.equal(extractEvent.mimeType, "application/pdf");
        assert.ok(
          typeof extractEvent.durationMs === "number" && (extractEvent.durationMs as number) >= 0,
        );
        assert.ok(
          typeof extractEvent.textLength === "number" && (extractEvent.textLength as number) > 0,
        );
      } finally {
        logger.info = originalLoggerInfo;
      }
    });
  });
});
