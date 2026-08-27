import { ChatOllama } from "@langchain/ollama";
import { env } from "../config/env.js";

export async function generateLangChainText(prompt: string): Promise<string> {
  const llm = new ChatOllama({
    model: env.OLLAMA_MODEL,
    temperature: 0,
    baseUrl: env.OLLAMA_HOST,
  });

  const start = performance.now();
  try {
    const response = await llm.invoke(prompt, {
      signal: AbortSignal.timeout(60_000),
    });

    return typeof response.content === "string"
      ? response.content
      : JSON.stringify(response.content);
  } finally {
    const duration = performance.now() - start;
    console.log(`Ollama (LangChain) request took ${duration.toFixed(0)}ms`);
  }
}
