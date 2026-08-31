import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z
    .string()
    .url()
    .default("postgresql://postgres:postgres@postgres:5432/resume_db"),
  DATABASE_URL_TEST: z.string().url().optional(),
  OLLAMA_HOST: z.string().url().default("http://ollama:11434"),
  OLLAMA_MODEL: z.string().min(1).default("qwen3:4b"),
  LLM_TIMEOUT_MS: z.coerce.number().default(180_000),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error("❌ Invalid environment variables:", parsedEnv.error.format());
  process.exit(1);
}

export const env = parsedEnv.data;
export type Env = z.infer<typeof envSchema>;
