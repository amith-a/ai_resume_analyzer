import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { orchestrateRagRetrieval } from "../src/services/rag-retrieval.service.js";
import { generateRagAnswer } from "../src/services/rag-generation.service.js";
import {
  produceGroundedAnswer,
  GROUNDING_FALLBACK_TEXT,
} from "../src/services/grounded-answer.service.js";
import { trackSources } from "../src/services/source-tracker.service.js";
import { UpstreamAIError } from "../src/errors/index.js";
import { RunnableLambda } from "@langchain/core/runnables";
import type { BaseLanguageModelInput } from "@langchain/core/language_models/base";
import type { BaseMessage } from "@langchain/core/messages";

describe("RAG Failure Handling & Boundary Verification (Phase 12 — Block 8)", () => {
  describe("1. Retrieval Layer Failure Handling", () => {
    it("propagates embedding failures as UpstreamAIError and never silently swallows into empty chunks", async () => {
      const failingEmbeddingsClient = {
        embedQuery: async () => {
          throw new Error("Ollama embedding service unavailable");
        },
      };

      await assert.rejects(
        async () => {
          await orchestrateRagRetrieval(
            { query: "Software engineer skills", documentId: "doc-123" },
            { embeddingsClient: failingEmbeddingsClient },
          );
        },
        (err: unknown) => {
          assert.ok(err instanceof UpstreamAIError);
          assert.match(err.message, /Failed to generate text embedding/);
          return true;
        },
      );
    });

    it("propagates database/vector search repository failures directly without converting to empty results", async () => {
      const mockVector = new Array(768).fill(0.01);
      const mockEmbeddingsClient = {
        embedQuery: async () => mockVector,
      };

      const failingRetrieveFn = async () => {
        throw new Error("PostgreSQL connection timeout: pool exhausted");
      };

      await assert.rejects(
        async () => {
          await orchestrateRagRetrieval(
            { query: "Database scaling", documentId: "doc-123" },
            {
              embeddingsClient: mockEmbeddingsClient,
              retrieveChunks: failingRetrieveFn,
            },
          );
        },
        (err: unknown) => {
          assert.ok(err instanceof Error);
          assert.match(err.message, /PostgreSQL connection timeout/);
          return true;
        },
      );
    });

    it("distinguishes healthy zero-chunk retrieval from failure (returns empty array without throwing)", async () => {
      const mockVector = new Array(768).fill(0.01);
      const mockEmbeddingsClient = {
        embedQuery: async () => mockVector,
      };

      const emptyRetrieveFn = async () => [];

      const result = await orchestrateRagRetrieval(
        { query: "Unmatched query topic", documentId: "doc-123" },
        {
          embeddingsClient: mockEmbeddingsClient,
          retrieveChunks: emptyRetrieveFn,
        },
      );

      assert.deepEqual(result, []);
    });
  });

  describe("2. Generation Layer Failure Handling", () => {
    it("propagates model invocation crashes as UpstreamAIError and never fabricates or returns fake fallback", async () => {
      const failingModel = new RunnableLambda<BaseLanguageModelInput, BaseMessage>({
        func: async () => {
          throw new Error("CUDA kernel execution error");
        },
      });

      await assert.rejects(
        async () => {
          await generateRagAnswer(
            { query: "Explain achievements", context: "[Source 1]\nAchieved 99.99% uptime" },
            { modelOverride: failingModel },
          );
        },
        (err: unknown) => {
          assert.ok(err instanceof UpstreamAIError);
          assert.match(err.message, /RAG answer generation failed/);
          return true;
        },
      );
    });

    it("propagates generation timeouts as UpstreamAIError without returning ungrounded partial answer", async () => {
      const hungModel = new RunnableLambda<BaseLanguageModelInput, BaseMessage>({
        func: async (_input: BaseLanguageModelInput, options?: { signal?: AbortSignal }) => {
          return new Promise<BaseMessage>((_resolve, reject) => {
            if (options?.signal) {
              options.signal.addEventListener("abort", () => {
                reject(new Error("Timeout expired"));
              });
            }
          });
        },
      });

      await assert.rejects(
        async () => {
          await generateRagAnswer(
            { query: "Explain background", context: "[Source 1]\nEngineer" },
            { modelOverride: hungModel, timeoutMsOverride: 15 },
          );
        },
        (err: unknown) => {
          assert.ok(err instanceof UpstreamAIError);
          return true;
        },
      );
    });
  });

  describe("3. Grounded Answer & Fallback Boundary Distinction", () => {
    it("uses grounding fallback ONLY for legitimate missing context (hasUsableContext = false)", () => {
      const result = produceGroundedAnswer({
        answer: "Raw text that was not supported by context",
        hasUsableContext: false,
      });

      assert.equal(result.answer, GROUNDING_FALLBACK_TEXT);
    });

    it("uses grounding fallback when LLM output is empty despite context existing", () => {
      const result = produceGroundedAnswer({
        answer: "   \n\t  ",
        hasUsableContext: true,
      });

      assert.equal(result.answer, GROUNDING_FALLBACK_TEXT);
    });

    it("source tracker correctly yields empty sources when context was empty", () => {
      const grounded = produceGroundedAnswer({
        answer: "",
        hasUsableContext: false,
      });

      const tracked = trackSources({
        answer: grounded.answer,
        chunks: [],
      });

      assert.equal(tracked.answer, GROUNDING_FALLBACK_TEXT);
      assert.deepEqual(tracked.sources, []);
    });
  });
});
