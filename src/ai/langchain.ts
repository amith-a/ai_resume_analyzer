import { ChatOllama } from "@langchain/ollama";

export async function generateLangChainText(prompt: string): Promise<string> {
  const ollamaHost = process.env.OLLAMA_HOST;
  if (!ollamaHost) {
    throw new Error("OLLAMA_HOST environment variable is not set");
  }

  const model = process.env.OLLAMA_MODEL || "qwen3:4b";

  const llm = new ChatOllama({
    model,
    temperature: 0,
    baseUrl: ollamaHost,
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
