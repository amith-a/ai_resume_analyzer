import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { RunnableLambda, type Runnable } from "@langchain/core/runnables";
import { OutputParserException } from "@langchain/core/output_parsers";
import { analyzeResume } from "../../src/services/resume-analyzer.service.js";
import { compareJobDescription } from "../../src/services/job-comparison.service.js";
import { generateRagAnswer } from "../../src/services/rag-generation.service.js";
import { embedText, type EmbeddingsClient } from "../../src/services/embedding.service.js";
import { AskResumeBodySchema } from "../../src/schemas/ask-resume-request.schema.js";
import { RetrieveChunksRequestSchema } from "../../src/schemas/retrieval-request.schema.js";
import { JobComparisonRequestSchema } from "../../src/schemas/job-comparison-request.schema.js";
import {
  UpstreamAIError,
  SchemaValidationError,
  PayloadTooLargeError,
} from "../../src/errors/index.js";
import { logger } from "../../src/config/logger.js";

describe("AI Reliability & Safety Tests (Phase 14 — Block 4)", () => {
  describe("1. Bounded Timeouts (Deterministic Mocks)", () => {
    it("1.1 analyzeResume aborts and maps timeout signal to UpstreamAIError", async () => {
      const mockTimedOutRunnable: Runnable<unknown, unknown> = {
        invoke: async (_input: unknown, options?: { signal?: AbortSignal }) => {
          if (options?.signal?.aborted) {
            throw options.signal.reason ?? new Error("AbortError: Operation timed out");
          }
          const abortErr = new Error("AbortError: The operation was aborted");
          abortErr.name = "AbortError";
          throw abortErr;
        },
      } as unknown as Runnable<unknown, unknown>;

      await assert.rejects(
        async () => {
          await analyzeResume("Valid candidate resume text", mockTimedOutRunnable);
        },
        (err: unknown) => {
          assert.ok(err instanceof UpstreamAIError);
          assert.match(err.message, /Upstream LLM invocation failed or timed out/);
          return true;
        },
      );
    });

    it("1.2 compareJobDescription maps timeout signal to UpstreamAIError", async () => {
      const mockTimedOutRunnable: Runnable<unknown, unknown> = {
        invoke: async () => {
          const abortErr = new Error("AbortError: The operation was aborted");
          abortErr.name = "AbortError";
          throw abortErr;
        },
      } as unknown as Runnable<unknown, unknown>;

      await assert.rejects(
        async () => {
          await compareJobDescription(
            "Valid resume text",
            "Valid job description",
            mockTimedOutRunnable,
          );
        },
        (err: unknown) => {
          assert.ok(err instanceof UpstreamAIError);
          assert.match(err.message, /Upstream LLM invocation failed or timed out/);
          return true;
        },
      );
    });

    it("1.3 generateRagAnswer maps timeout signal to UpstreamAIError", async () => {
      const mockTimedOutRunnable: Runnable<unknown, unknown> = {
        invoke: async () => {
          const abortErr = new Error("AbortError: The operation was aborted");
          abortErr.name = "AbortError";
          throw abortErr;
        },
      } as unknown as Runnable<unknown, unknown>;

      await assert.rejects(
        async () => {
          await generateRagAnswer(
            { query: "Where did candidate work?", context: "Context text" },
            { modelOverride: mockTimedOutRunnable },
          );
        },
        (err: unknown) => {
          assert.ok(err instanceof UpstreamAIError);
          assert.match(err.message, /RAG answer generation failed or timed out/);
          return true;
        },
      );
    });

    it("1.4 embedText maps timeout to UpstreamAIError", async () => {
      const hangingClient: EmbeddingsClient = {
        embedQuery: async () => {
          return new Promise<number[]>(() => {
            // Intentionally unfulfilled promise to test withTimeout
          });
        },
      };

      await assert.rejects(
        async () => {
          // Fast timeout override (10ms)
          await embedText("Sample text", hangingClient, 10);
        },
        (err: unknown) => {
          assert.ok(err instanceof UpstreamAIError);
          assert.match(err.message, /Failed to generate text embedding from upstream model/);
          return true;
        },
      );
    });
  });

  describe("2. AI-Facing Input Limits", () => {
    it("2.1 AskResumeBodySchema enforces 1000 character maximum on query", () => {
      const validQuery = "a".repeat(1000);
      const validResult = AskResumeBodySchema.safeParse({ query: validQuery });
      assert.equal(validResult.success, true);

      const oversizedQuery = "a".repeat(1001);
      const invalidResult = AskResumeBodySchema.safeParse({ query: oversizedQuery });
      assert.equal(invalidResult.success, false);
      if (!invalidResult.success) {
        assert.equal(invalidResult.error.issues[0].message, "Query cannot exceed 1000 characters");
      }
    });

    it("2.2 RetrieveChunksRequestSchema enforces 1000 character maximum on query", () => {
      const validQuery = "b".repeat(1000);
      const validResult = RetrieveChunksRequestSchema.safeParse({
        query: validQuery,
        documentId: "doc-123",
      });
      assert.equal(validResult.success, true);

      const oversizedQuery = "b".repeat(1001);
      const invalidResult = RetrieveChunksRequestSchema.safeParse({
        query: oversizedQuery,
        documentId: "doc-123",
      });
      assert.equal(invalidResult.success, false);
      if (!invalidResult.success) {
        assert.equal(invalidResult.error.issues[0].message, "Query cannot exceed 1000 characters");
      }
    });

    it("2.3 JobComparisonRequestSchema enforces 50,000 character maximum on jobDescription", () => {
      const validJob = "c".repeat(50000);
      const validResult = JobComparisonRequestSchema.safeParse({
        documentId: "doc-123",
        jobDescription: validJob,
      });
      assert.equal(validResult.success, true);

      const oversizedJob = "c".repeat(50001);
      const invalidResult = JobComparisonRequestSchema.safeParse({
        documentId: "doc-123",
        jobDescription: oversizedJob,
      });
      assert.equal(invalidResult.success, false);
      if (!invalidResult.success) {
        assert.equal(
          invalidResult.error.issues[0].message,
          "Job description cannot exceed 50000 characters",
        );
      }
    });

    it("2.4 analyzeResume rejects resume text exceeding RESUME_ANALYSIS_MAX_CHARACTERS", async () => {
      const oversizedText = "x".repeat(50001);

      await assert.rejects(
        async () => {
          await analyzeResume(oversizedText);
        },
        (err: unknown) => {
          assert.ok(err instanceof PayloadTooLargeError);
          assert.match(
            err.message,
            /Resume text exceeds maximum allowed limit of 50000 characters/,
          );
          return true;
        },
      );
    });
  });

  describe("3. Structured Output Validation", () => {
    it("3.1 generateRagAnswer accepts and returns valid structured output", async () => {
      const mockModel = new RunnableLambda({
        func: async () => ({
          answer: "Candidate has 5 years of TypeScript experience.",
        }),
      });

      const result = await generateRagAnswer(
        { query: "How many years of TypeScript?", context: "TypeScript: 5 years" },
        { modelOverride: mockModel },
      );

      assert.equal(result.answer, "Candidate has 5 years of TypeScript experience.");
    });

    it("3.2 generateRagAnswer throws SchemaValidationError if model output is malformed", async () => {
      const mockModel = new RunnableLambda({
        func: async () => ({
          invalidField: "No answer property here",
        }),
      });

      await assert.rejects(
        async () => {
          await generateRagAnswer(
            { query: "Question?", context: "Context" },
            { modelOverride: mockModel },
          );
        },
        (err: unknown) => {
          assert.ok(err instanceof SchemaValidationError);
          assert.match(err.message, /Model output failed defensive schema validation/);
          return true;
        },
      );
    });

    it("3.3 generateRagAnswer maps OutputParserException to SchemaValidationError", async () => {
      const mockModel = new RunnableLambda({
        func: async () => {
          throw new OutputParserException("Failed to parse JSON output", "raw invalid json");
        },
      });

      await assert.rejects(
        async () => {
          await generateRagAnswer(
            { query: "Question?", context: "Context" },
            { modelOverride: mockModel },
          );
        },
        (err: unknown) => {
          assert.ok(err instanceof SchemaValidationError);
          assert.match(err.message, /Model output failed defensive schema validation/);
          return true;
        },
      );
    });
  });

  describe("4. Safe AI Operational Logging", () => {
    it("4.1 LLM failure logs operational diagnostics without emitting sensitive resume text", async () => {
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
        loggedErrors.push(args.map(String).join(" "));
      };

      const sensitiveSnippet = "CONFIDENTIAL_CANDIDATE_DATA_XYZ_987";
      const mockFailingModel: Runnable<unknown, unknown> = {
        invoke: async () => {
          const err = new OutputParserException(
            `Failed to parse: Text: "${sensitiveSnippet}"`,
            sensitiveSnippet,
          );
          throw err;
        },
      } as unknown as Runnable<unknown, unknown>;

      try {
        await assert.rejects(async () => {
          await analyzeResume(`Valid resume with ${sensitiveSnippet}`, mockFailingModel);
        });

        // Verify that sensitiveSnippet was NOT emitted into error logs
        const allLogs = loggedErrors.join("\n");
        assert.equal(
          allLogs.includes(sensitiveSnippet),
          false,
          "Logs must not contain sensitive resume snippet or prompt content",
        );
        // Verify operational metadata was logged
        assert.match(allLogs, /Resume analysis LLM invocation failed after \d+ms/);
      } finally {
        logger.error = originalLoggerError;
        console.error = originalConsoleError;
      }
    });
  });
});
