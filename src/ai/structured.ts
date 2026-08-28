import { ChatOllama } from "@langchain/ollama";
import { env } from "../config/env.js";
import { profileExtractionPrompt } from "./prompts/profile.prompt.js";
import {
  CandidateProfile,
  CandidateProfileSchema,
} from "./schemas/profile.schema.js";
import { SchemaValidationError, UpstreamAIError } from "./errors.js";

export async function extractStructuredProfile(
  rawText: string
): Promise<CandidateProfile> {
  const llm = new ChatOllama({
    model: env.OLLAMA_MODEL,
    temperature: 0,
    baseUrl: env.OLLAMA_HOST,
    think: false,
  });

  const structuredLlm = llm.withStructuredOutput(CandidateProfileSchema);
  const extractionChain = profileExtractionPrompt.pipe(structuredLlm);

  const start = performance.now();
  let structuredResult: unknown;

  try {
    structuredResult = await extractionChain.invoke(
      { text: rawText },
      { signal: AbortSignal.timeout(90_000) }
    );
  } catch (error) {
    const duration = performance.now() - start;
    console.error(
      `Ollama structured extraction failed after ${duration.toFixed(0)}ms:`,
      error
    );
    throw new UpstreamAIError(
      "Upstream LLM invocation failed or timed out",
      error
    );
  }

  const duration = performance.now() - start;
  console.log(
    `Ollama (LangChain structured) inference took ${duration.toFixed(0)}ms`
  );

  // Defensive validation using the exact same single-source-of-truth schema
  const parseResult = CandidateProfileSchema.safeParse(structuredResult);

  if (!parseResult.success) {
    console.error(
      "Model structured output failed Zod schema validation:",
      parseResult.error.format()
    );
    throw new SchemaValidationError(
      "Model output failed defensive schema validation",
      parseResult.error.issues
    );
  }

  return parseResult.data;
}
