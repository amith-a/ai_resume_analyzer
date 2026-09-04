import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseEnv } from "../src/config/env.js";

const VALID_DB_URL = "postgresql://postgres:postgres@postgres:5432/resume_db";

describe("Configuration & Startup Environment Validation (Phase 14 — Block 1)", () => {
  it("1. returns valid default configuration when only required DATABASE_URL is provided", () => {
    const config = parseEnv({
      DATABASE_URL: VALID_DB_URL,
    });

    assert.equal(config.NODE_ENV, "development");
    assert.equal(config.PORT, 3000);
    assert.equal(config.DATABASE_URL, VALID_DB_URL);
    assert.equal(config.DATABASE_URL_TEST, undefined);
    assert.equal(config.OLLAMA_HOST, "http://ollama:11434");
    assert.equal(config.OLLAMA_MODEL, "phi4-mini:3.8b");
    assert.equal(config.OLLAMA_EMBEDDING_MODEL, "nomic-embed-text");
    assert.equal(config.LLM_TIMEOUT_MS, 180_000);
    assert.equal(config.EMBEDDING_TIMEOUT_MS, 60_000);
    assert.equal(config.CHUNK_SIZE, 500);
    assert.equal(config.CHUNK_OVERLAP, 100);
    assert.equal(config.RAG_MAX_CONTEXT_CHARACTERS, 4000);
    assert.equal(config.RESUME_ANALYSIS_MAX_CHARACTERS, 50_000);
  });

  it("2. accepts valid custom environment overrides", () => {
    const customEnv: Record<string, string> = {
      NODE_ENV: "production",
      PORT: "8080",
      DATABASE_URL: "postgresql://custom_user:custom_pass@dbserver:5432/custom_db",
      DATABASE_URL_TEST: "postgresql://custom_user:custom_pass@dbserver:5432/custom_test_db",
      OLLAMA_HOST: "http://ollama-prod:11434",
      OLLAMA_MODEL: "qwen:7b",
      OLLAMA_EMBEDDING_MODEL: "bge-large",
      LLM_TIMEOUT_MS: "120000",
      EMBEDDING_TIMEOUT_MS: "30000",
      CHUNK_SIZE: "600",
      CHUNK_OVERLAP: "150",
      RAG_MAX_CONTEXT_CHARACTERS: "6000",
      RESUME_ANALYSIS_MAX_CHARACTERS: "80000",
    };

    const config = parseEnv(customEnv);

    assert.equal(config.NODE_ENV, "production");
    assert.equal(config.PORT, 8080);
    assert.equal(
      config.DATABASE_URL,
      "postgresql://custom_user:custom_pass@dbserver:5432/custom_db",
    );
    assert.equal(
      config.DATABASE_URL_TEST,
      "postgresql://custom_user:custom_pass@dbserver:5432/custom_test_db",
    );
    assert.equal(config.OLLAMA_HOST, "http://ollama-prod:11434");
    assert.equal(config.OLLAMA_MODEL, "qwen:7b");
    assert.equal(config.OLLAMA_EMBEDDING_MODEL, "bge-large");
    assert.equal(config.LLM_TIMEOUT_MS, 120_000);
    assert.equal(config.EMBEDDING_TIMEOUT_MS, 30_000);
    assert.equal(config.CHUNK_SIZE, 600);
    assert.equal(config.CHUNK_OVERLAP, 150);
    assert.equal(config.RAG_MAX_CONTEXT_CHARACTERS, 6000);
    assert.equal(config.RESUME_ANALYSIS_MAX_CHARACTERS, 80000);
  });

  it("3. rejects missing or empty required string values", () => {
    assert.throws(
      () => parseEnv({}),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes("DATABASE_URL"));
        return true;
      },
    );

    assert.throws(
      () => parseEnv({ DATABASE_URL: "" }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes("DATABASE_URL"));
        return true;
      },
    );

    assert.throws(
      () => parseEnv({ DATABASE_URL: VALID_DB_URL, OLLAMA_HOST: "   " }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes("OLLAMA_HOST"));
        return true;
      },
    );
  });

  it("4. rejects invalid PORT values (non-numeric, negative, zero)", () => {
    const invalidPorts = ["abc", "-1", "0"];

    for (const invalidPort of invalidPorts) {
      assert.throws(
        () => parseEnv({ DATABASE_URL: VALID_DB_URL, PORT: invalidPort }),
        (err: unknown) => {
          assert.ok(err instanceof Error);
          assert.ok(err.message.includes("PORT"));
          return true;
        },
      );
    }
  });

  it("5. rejects invalid timeout values (<= 0 or non-numeric)", () => {
    assert.throws(
      () => parseEnv({ DATABASE_URL: VALID_DB_URL, LLM_TIMEOUT_MS: "0" }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes("LLM_TIMEOUT_MS"));
        return true;
      },
    );

    assert.throws(
      () => parseEnv({ DATABASE_URL: VALID_DB_URL, EMBEDDING_TIMEOUT_MS: "-100" }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes("EMBEDDING_TIMEOUT_MS"));
        return true;
      },
    );
  });

  it("6. rejects invalid chunk values (CHUNK_SIZE <= 0, CHUNK_OVERLAP < 0)", () => {
    assert.throws(
      () => parseEnv({ DATABASE_URL: VALID_DB_URL, CHUNK_SIZE: "0" }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes("CHUNK_SIZE"));
        return true;
      },
    );

    assert.throws(
      () => parseEnv({ DATABASE_URL: VALID_DB_URL, CHUNK_OVERLAP: "-5" }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes("CHUNK_OVERLAP"));
        return true;
      },
    );
  });

  it("7. rejects invalid chunk relationship when CHUNK_OVERLAP >= CHUNK_SIZE", () => {
    assert.throws(
      () =>
        parseEnv({
          DATABASE_URL: VALID_DB_URL,
          CHUNK_SIZE: "500",
          CHUNK_OVERLAP: "500",
        }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes("CHUNK_OVERLAP"));
        assert.ok(err.message.includes("Invalid value"));
        return true;
      },
    );

    assert.throws(
      () =>
        parseEnv({
          DATABASE_URL: VALID_DB_URL,
          CHUNK_SIZE: "500",
          CHUNK_OVERLAP: "600",
        }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes("CHUNK_OVERLAP"));
        return true;
      },
    );
  });

  it("8. rejects invalid URLs for DATABASE_URL and OLLAMA_HOST", () => {
    assert.throws(
      () => parseEnv({ DATABASE_URL: "not-a-valid-url" }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes("DATABASE_URL"));
        assert.ok(err.message.includes("Invalid url"));
        return true;
      },
    );

    assert.throws(
      () => parseEnv({ DATABASE_URL: VALID_DB_URL, OLLAMA_HOST: "not-a-valid-url" }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes("OLLAMA_HOST"));
        return true;
      },
    );
  });

  it("9. rejects empty or whitespace model values", () => {
    assert.throws(
      () => parseEnv({ DATABASE_URL: VALID_DB_URL, OLLAMA_MODEL: "   " }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes("OLLAMA_MODEL"));
        return true;
      },
    );

    assert.throws(
      () => parseEnv({ DATABASE_URL: VALID_DB_URL, OLLAMA_EMBEDDING_MODEL: "" }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes("OLLAMA_EMBEDDING_MODEL"));
        return true;
      },
    );
  });

  it("10. identifies the invalid variable in error messages", () => {
    assert.throws(
      () => parseEnv({ DATABASE_URL: VALID_DB_URL, PORT: "invalid_port" }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.startsWith("Invalid environment configuration:"));
        assert.ok(err.message.includes("PORT: Expected number"));
        return true;
      },
    );
  });

  it("11. never exposes secret credentials or raw input values in error messages", () => {
    const sensitiveSecret = "SuperSecretDbPassword123!#%";
    const malformedUrlWithSecret = `postgres://user:${sensitiveSecret}@bad-domain-that-fails-url:abc`;

    assert.throws(
      () => parseEnv({ DATABASE_URL: malformedUrlWithSecret }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(
          !err.message.includes(sensitiveSecret),
          "Error message must never leak password or secret",
        );
        assert.ok(
          !err.message.includes(malformedUrlWithSecret),
          "Error message must never leak raw input string",
        );
        assert.equal(err.message, "Invalid environment configuration: DATABASE_URL: Invalid url");
        return true;
      },
    );
  });

  it("12. throws without calling process.exit", () => {
    let exitCalled = false;
    const originalExit = process.exit;
    process.exit = (() => {
      exitCalled = true;
      throw new Error("process.exit was unexpectedly called");
    }) as unknown as typeof process.exit;

    try {
      assert.throws(
        () => parseEnv({ DATABASE_URL: VALID_DB_URL, PORT: "not_a_number" }),
        (err: unknown) => err instanceof Error,
      );
      assert.equal(exitCalled, false, "process.exit must never be called by parseEnv");
    } finally {
      process.exit = originalExit;
    }
  });
});
