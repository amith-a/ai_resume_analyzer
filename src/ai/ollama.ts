interface OllamaGenerateResponse {
  response: string;
  model: string;
  done: boolean;
}

export async function generateText(prompt: string): Promise<string> {
  const ollamaHost = process.env.OLLAMA_HOST;
  if (!ollamaHost) {
    throw new Error("OLLAMA_HOST environment variable is not set");
  }

  const model = process.env.OLLAMA_MODEL || "qwen3:4b";

  const start = performance.now();
  try {
    const response = await fetch(`${ollamaHost}/api/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
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
