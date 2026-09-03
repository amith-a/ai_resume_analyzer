import { ChatOllama, OllamaEmbeddings } from "@langchain/ollama";
import type { z } from "zod";
import { env } from "../config/env.js";

export function createStructuredOllamaModel<T extends z.ZodType>(schema: T) {
  return new ChatOllama({
    model: env.OLLAMA_MODEL,
    baseUrl: env.OLLAMA_HOST,
    temperature: 0,
    think: false,
  }).withStructuredOutput(schema);
}

export function createOllamaChatModel(modelName?: string): ChatOllama {
  return new ChatOllama({
    model: modelName ?? env.OLLAMA_MODEL,
    baseUrl: env.OLLAMA_HOST,
    temperature: 0,
    think: false,
  });
}

export function createOllamaEmbeddings(modelName?: string): OllamaEmbeddings {
  return new OllamaEmbeddings({
    model: modelName ?? env.OLLAMA_EMBEDDING_MODEL,
    baseUrl: env.OLLAMA_HOST,
    maxRetries: 2,
  });
}
