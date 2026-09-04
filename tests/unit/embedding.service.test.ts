import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { embedText, embedChunks, EmbeddingsClient } from "../../src/services/embedding.service.js";
import { createOllamaEmbeddings } from "../../src/ai/model-factory.js";
import { UpstreamAIError } from "../../src/errors/index.js";
import { env } from "../../src/config/env.js";

describe("Embedding Service Unit Tests", () => {
  // Helper to generate mock vector of specified dimension
  const createMockVector = (dim: number = 768, seed: number = 0.1): number[] =>
    Array.from({ length: dim }, (_, i) => Math.sin(seed + i * 0.01));

  describe("Single Text / Query Embedding (embedText)", () => {
    it("1. returns a valid embedding vector for valid text", async () => {
      const mockVector = createMockVector(768);
      const mockClient: EmbeddingsClient = {
        embedQuery: async (text: string) => {
          assert.equal(text, "Experienced Full Stack Engineer with TypeScript");
          return mockVector;
        },
      };

      const result = await embedText(
        "  Experienced Full Stack Engineer with TypeScript  ",
        mockClient,
      );

      assert.equal(Array.isArray(result), true);
      assert.equal(result.length, 768);
      assert.deepEqual(result, mockVector);
    });

    it("2. returns consistent vector structure and dimension for both queries and chunks", async () => {
      const queryVector = createMockVector(768, 1.0);
      const chunkVector = createMockVector(768, 2.0);

      const mockClient: EmbeddingsClient = {
        embedQuery: async (text: string) => {
          if (text === "Software Engineer") return queryVector;
          if (text === "Led development of distributed microservices.") return chunkVector;
          throw new Error(`Unexpected input: ${text}`);
        },
      };

      const searchResult = await embedText("Software Engineer", mockClient);
      const chunkResult = await embedText(
        "Led development of distributed microservices.",
        mockClient,
      );

      assert.equal(searchResult.length, 768);
      assert.equal(chunkResult.length, 768);
      assert.equal(typeof searchResult[0], "number");
      assert.equal(typeof chunkResult[0], "number");
    });

    it("3. rejects empty string, null, undefined, or non-string input with TypeError", async () => {
      await assert.rejects(
        async () => embedText(""),
        (err: Error) => {
          assert(err instanceof TypeError);
          assert.match(err.message, /must be a non-empty string/i);
          return true;
        },
      );

      await assert.rejects(
        async () => embedText("   \n\t  "),
        (err: Error) => {
          assert(err instanceof TypeError);
          assert.match(err.message, /must be a non-empty string/i);
          return true;
        },
      );

      await assert.rejects(
        async () => embedText(null as any),
        (err: Error) => {
          assert(err instanceof TypeError);
          return true;
        },
      );

      await assert.rejects(
        async () => embedText(12345 as any),
        (err: Error) => {
          assert(err instanceof TypeError);
          return true;
        },
      );
    });

    it("4. wraps upstream network failures or model errors in UpstreamAIError", async () => {
      const mockFailingClient: EmbeddingsClient = {
        embedQuery: async () => {
          throw new Error("Ollama connection refused at http://ollama:11434");
        },
      };

      await assert.rejects(
        async () => embedText("Test query", mockFailingClient),
        (err: Error) => {
          assert(err instanceof UpstreamAIError);
          assert.match(err.message, /Failed to generate text embedding/i);
          assert(
            err.cause instanceof Error && err.cause.message.includes("Ollama connection refused"),
          );
          return true;
        },
      );
    });

    it("5. validates output structure and throws UpstreamAIError if model returns invalid/non-numeric vector", async () => {
      const invalidClient: EmbeddingsClient = {
        embedQuery: async () => [0.1, NaN, 0.3] as any,
      };

      await assert.rejects(
        async () => embedText("Sample text", invalidClient),
        (err: Error) => {
          assert(err instanceof UpstreamAIError);
          return true;
        },
      );
    });

    it("6. validates output and throws UpstreamAIError if model returns empty array", async () => {
      const emptyClient: EmbeddingsClient = {
        embedQuery: async () => [],
      };

      await assert.rejects(
        async () => embedText("Sample text", emptyClient),
        (err: Error) => {
          assert(err instanceof UpstreamAIError);
          return true;
        },
      );
    });

    it("7. throws UpstreamAIError when embedding invocation exceeds timeout", async () => {
      const slowClient: EmbeddingsClient = {
        embedQuery: async () => {
          await new Promise((resolve) => setTimeout(resolve, 50));
          return createMockVector(768);
        },
      };

      await assert.rejects(
        async () => embedText("Sample text", slowClient, 10),
        (err: Error) => {
          assert(err instanceof UpstreamAIError);
          assert.match(err.message, /Failed to generate text embedding/i);
          assert(err.cause instanceof Error && err.cause.message.includes("timed out after 10ms"));
          return true;
        },
      );
    });
  });

  describe("Batch Text / Chunks Embedding (embedChunks)", () => {
    it("7. returns array of vectors matching input chunks order and length", async () => {
      const chunk1 = "Chunk 1: Frontend development with React and TypeScript";
      const chunk2 = "Chunk 2: Backend development with Node.js and PostgreSQL";

      const v1 = createMockVector(768, 1);
      const v2 = createMockVector(768, 2);

      const mockClient: EmbeddingsClient = {
        embedQuery: async () => v1,
        embedDocuments: async (docs: string[]) => {
          assert.deepEqual(docs, [chunk1, chunk2]);
          return [v1, v2];
        },
      };

      const results = await embedChunks([chunk1, chunk2], mockClient);

      assert.equal(results.length, 2);
      assert.deepEqual(results[0], v1);
      assert.deepEqual(results[1], v2);
    });

    it("8. falls back to sequential embedQuery if embedDocuments is not provided", async () => {
      const texts = ["Chunk A", "Chunk B"];
      const vA = createMockVector(768, 1);
      const vB = createMockVector(768, 2);

      const mockClient: EmbeddingsClient = {
        embedQuery: async (t) => (t === "Chunk A" ? vA : vB),
      };

      const results = await embedChunks(texts, mockClient);

      assert.equal(results.length, 2);
      assert.deepEqual(results[0], vA);
      assert.deepEqual(results[1], vB);
    });

    it("9. rejects empty array or non-array input with TypeError", async () => {
      await assert.rejects(
        async () => embedChunks([]),
        (err: Error) => {
          assert(err instanceof TypeError);
          assert.match(err.message, /must be a non-empty array of strings/i);
          return true;
        },
      );

      await assert.rejects(
        async () => embedChunks(["Valid chunk", "   "]),
        (err: Error) => {
          assert(err instanceof TypeError);
          assert.match(err.message, /must be a non-empty string/i);
          return true;
        },
      );
    });
  });

  describe("Model Factory & Configuration", () => {
    it("10. createOllamaEmbeddings constructs an instance using configured model name and host", () => {
      const embeddings = createOllamaEmbeddings();
      assert.equal(embeddings.model, env.OLLAMA_EMBEDDING_MODEL);
      assert.equal(embeddings.baseUrl, env.OLLAMA_HOST);
    });

    it("11. createOllamaEmbeddings allows custom model override", () => {
      const embeddings = createOllamaEmbeddings("custom-embed-model");
      assert.equal(embeddings.model, "custom-embed-model");
    });
  });
});
