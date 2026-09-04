import "dotenv/config";
import { z } from "zod";

interface ValidationIssue {
  code: string;
  message: string;
  expected?: string;
  format?: string;
  minimum?: number | bigint;
  maximum?: number | bigint;
}

function getSafeValidationReason(issue: ValidationIssue): string {
  switch (issue.code) {
    case "invalid_type":
      return `Expected ${issue.expected}`;
    case "invalid_format":
      return `Invalid ${issue.format}`;
    case "too_small":
      return `Value must be at least ${issue.minimum}`;
    case "too_big":
      return `Value must be at most ${issue.maximum}`;
    default:
      return "Invalid value";
  }
}

export const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    PORT: z.coerce.number().int().positive().default(3000),
    DATABASE_URL: z.url(),
    DATABASE_URL_TEST: z.url().optional(),
    OLLAMA_HOST: z.url().default("http://ollama:11434"),
    OLLAMA_MODEL: z.string().trim().min(1, "Cannot be empty").default("phi4-mini:3.8b"),
    OLLAMA_EMBEDDING_MODEL: z.string().trim().min(1, "Cannot be empty").default("nomic-embed-text"),
    LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(180_000),
    EMBEDDING_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
    CHUNK_SIZE: z.coerce.number().int().positive().default(500),
    CHUNK_OVERLAP: z.coerce.number().int().nonnegative().default(100),
    RAG_MAX_CONTEXT_CHARACTERS: z.coerce.number().int().positive().default(4000),
    RESUME_ANALYSIS_MAX_CHARACTERS: z.coerce.number().int().positive().default(50_000),
  })
  .refine((data) => data.CHUNK_OVERLAP < data.CHUNK_SIZE, {
    message: "CHUNK_OVERLAP must be strictly less than CHUNK_SIZE",
    path: ["CHUNK_OVERLAP"],
  });

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: Record<string, string | undefined> = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join(".") : "configuration";
        return `${path}: ${getSafeValidationReason(issue)}`;
      })
      .join("; ");
    throw new Error(`Invalid environment configuration: ${details}`);
  }
  return result.data;
}

export const env = parseEnv();
