import { env } from "../config/env.js";

interface OllamaGenerateResponse {
  response: string;
  model: string;
  done: boolean;
}

export async function generateText(prompt: string): Promise<string> {
  const start = performance.now();
  try {
    const response = await fetch(`${env.OLLAMA_HOST}/api/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: env.OLLAMA_MODEL,
        prompt,
        stream: false,
      }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!response.ok) {
      throw new Error(`Ollama request failed: ${response.status}`);
    }

    const data = (await response.json()) as OllamaGenerateResponse;

    return data.response;
  } finally {
    const duration = performance.now() - start;
    console.log(`Ollama (native fetch) request took ${duration.toFixed(0)}ms`);
  }
}
