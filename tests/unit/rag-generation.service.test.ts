import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { RunnableLambda } from "@langchain/core/runnables";
import type { BaseLanguageModelInput } from "@langchain/core/language_models/base";
import { generateRagAnswer } from "../../src/services/rag-generation.service.js";
import type { RagAnswer } from "../../src/ai/schemas/rag-answer.schema.js";
import { UpstreamAIError } from "../../src/errors/index.js";

describe("RAG Structured Generation Service Unit Tests (Phase 12 — Block 5)", () => {
  it("1. Structured answer succeeds: invokes structured model and returns answer object", async () => {
    const mockModel = new RunnableLambda<BaseLanguageModelInput, RagAnswer>({
      func: async () => ({
        answer: "The candidate has backend experience.",
      }),
    });

    const result = await generateRagAnswer(
      {
        query: "What is the candidate's experience?",
        context: "[Source 1]\nBackend Engineer with Node.js.",
      },
      {
        modelOverride: mockModel,
      },
    );

    assert.deepEqual(result, {
      answer: "The candidate has backend experience.",
    });
  });

  it("2. Structured output contains only answer field", async () => {
    const mockModel = new RunnableLambda<BaseLanguageModelInput, RagAnswer>({
      func: async () => ({
        answer: "3 years of TypeScript experience in SaaS platforms.",
      }),
    });

    const result = await generateRagAnswer(
      {
        query: "How much TypeScript experience?",
        context: "[Source 1]\nTypeScript for 3 years.",
      },
      {
        modelOverride: mockModel,
      },
    );

    assert.equal(result.answer, "3 years of TypeScript experience in SaaS platforms.");
  });

  it("3. Empty answer remains empty without fabricating fallback", async () => {
    const mockModel = new RunnableLambda<BaseLanguageModelInput, RagAnswer>({
      func: async () => ({
        answer: "",
      }),
    });

    const result = await generateRagAnswer(
      {
        query: "What is the favorite color?",
        context: "",
      },
      {
        modelOverride: mockModel,
      },
    );

    assert.deepEqual(result, {
      answer: "",
    });
  });

  it("4. Whitespace answer is normalized and trimmed", async () => {
    const mockModel = new RunnableLambda<BaseLanguageModelInput, RagAnswer>({
      func: async () => ({
        answer: "   The candidate has backend experience.   ",
      }),
    });

    const result = await generateRagAnswer(
      {
        query: "What experience?",
        context: "[Source 1]\nBackend experience",
      },
      {
        modelOverride: mockModel,
      },
    );

    assert.equal(result.answer, "The candidate has backend experience.");
  });

  it("5. <think> block inside structured answer is defensively removed", async () => {
    const mockModel = new RunnableLambda<BaseLanguageModelInput, RagAnswer>({
      func: async () => ({
        answer: "<think>internal reasoning</think>The candidate has backend experience.",
      }),
    });

    const result = await generateRagAnswer(
      {
        query: "Experience?",
        context: "[Source 1]\nBackend Engineer",
      },
      {
        modelOverride: mockModel,
      },
    );

    assert.equal(result.answer, "The candidate has backend experience.");
  });

  it("6. Multiline <think> block is defensively removed", async () => {
    const mockModel = new RunnableLambda<BaseLanguageModelInput, RagAnswer>({
      func: async () => ({
        answer: `<think>
First reasoning step.
Second reasoning step.
</think>
The candidate has backend experience.`,
      }),
    });

    const result = await generateRagAnswer(
      {
        query: "Experience?",
        context: "[Source 1]\nBackend Engineer",
      },
      {
        modelOverride: mockModel,
      },
    );

    assert.equal(result.answer, "The candidate has backend experience.");
  });

  it("7. Multiple <think> blocks are all removed", async () => {
    const mockModel = new RunnableLambda<BaseLanguageModelInput, RagAnswer>({
      func: async () => ({
        answer: `<think>first reasoning</think>
The candidate has backend experience.
<think>second reasoning</think>`,
      }),
    });

    const result = await generateRagAnswer(
      {
        query: "Experience?",
        context: "[Source 1]\nBackend Engineer",
      },
      {
        modelOverride: mockModel,
      },
    );

    assert.equal(result.answer, "The candidate has backend experience.");
  });

  it("8. Output containing only <think> tags yields empty string answer", async () => {
    const mockModel = new RunnableLambda<BaseLanguageModelInput, RagAnswer>({
      func: async () => ({
        answer: "<think>internal reasoning only</think>",
      }),
    });

    const result = await generateRagAnswer(
      {
        query: "Experience?",
        context: "[Source 1]\nBackend Engineer",
      },
      {
        modelOverride: mockModel,
      },
    );

    assert.equal(result.answer, "");
  });

  it("9. Structured model invocation failure: wraps upstream errors in UpstreamAIError", async () => {
    const mockModel = new RunnableLambda<BaseLanguageModelInput, RagAnswer>({
      func: async () => {
        throw new Error("Ollama structured output failure");
      },
    });

    await assert.rejects(
      async () => {
        await generateRagAnswer(
          {
            query: "What is candidate background?",
            context: "[Source 1]\nEngineer",
          },
          {
            modelOverride: mockModel,
          },
        );
      },
      (err: unknown) => {
        assert.ok(err instanceof UpstreamAIError);
        assert.match(err.message, /RAG answer generation failed/);
        return true;
      },
    );
  });

  it("10. Timeout: wraps invocation timeouts in UpstreamAIError", async () => {
    const mockModel = new RunnableLambda<BaseLanguageModelInput, RagAnswer>({
      func: async (_input: BaseLanguageModelInput, options?: { signal?: AbortSignal }) => {
        return new Promise<RagAnswer>((resolve, reject) => {
          const timeout = setTimeout(() => {
            resolve({ answer: "Delayed answer" });
          }, 100);

          if (options?.signal) {
            options.signal.addEventListener("abort", () => {
              clearTimeout(timeout);
              reject(new Error("Operation timed out"));
            });
          }
        });
      },
    });

    await assert.rejects(
      async () => {
        await generateRagAnswer(
          {
            query: "What is candidate background?",
            context: "[Source 1]\nEngineer",
          },
          {
            modelOverride: mockModel,
            timeoutMsOverride: 10,
          },
        );
      },
      (err: unknown) => {
        assert.ok(err instanceof UpstreamAIError);
        return true;
      },
    );
  });

  it("11. Input validation: rejects missing, empty, or whitespace-only query with TypeError", async () => {
    await assert.rejects(
      async () => {
        await generateRagAnswer({ query: "", context: "some context" });
      },
      { name: "TypeError", message: /Query must be a non-empty string/ },
    );

    await assert.rejects(
      async () => {
        await generateRagAnswer({ query: "   ", context: "some context" });
      },
      { name: "TypeError", message: /Query must be a non-empty string/ },
    );

    await assert.rejects(
      async () => {
        await generateRagAnswer(null as unknown as { query: string });
      },
      { name: "TypeError", message: /params must be an object/ },
    );
  });
});
