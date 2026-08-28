import { Router, Request, Response } from "express";
import { generateText } from "../ai/ollama.js";
import { generateLangChainText } from "../ai/langchain.js";
import { extractStructuredProfile } from "../ai/structured.js";
import { SchemaValidationError, UpstreamAIError } from "../ai/errors.js";

export const aiRouter = Router();

// POST /ai/test - direct Ollama fetch test
aiRouter.post("/test", async (req: Request, res: Response) => {
  try {
    const prompt = typeof req.body?.prompt === "string" ? req.body.prompt : "hello";
    const response = await generateText(prompt);
    res.status(200).json({ engine: "fetch", data: response });
  } catch (error) {
    console.error("AI test endpoint failed:", error);
    res.status(502).json({ status: "error", message: "LLM request failed" });
  }
});

// POST /ai/langchain/test - LangChain Ollama test
aiRouter.post("/langchain/test", async (req: Request, res: Response) => {
  try {
    const prompt = typeof req.body?.prompt === "string" ? req.body.prompt : "hello";
    const response = await generateLangChainText(prompt);
    res.status(200).json({ engine: "langchain", data: response });
  } catch (error) {
    console.error("LangChain test endpoint failed:", error);
    res.status(502).json({ status: "error", message: "LLM request failed" });
  }
});

// POST /ai/structured/test - LangChain structured output with Zod defensive validation
aiRouter.post("/structured/test", async (req: Request, res: Response) => {
  const text = req.body?.text;

  if (typeof text !== "string" || text.trim().length === 0) {
    res.status(400).json({
      status: "error",
      message: "Invalid request body: 'text' string field is required",
    });
    return;
  }

  try {
    const profile = await extractStructuredProfile(text.trim());
    res.status(200).json({
      status: "success",
      engine: "langchain-structured",
      data: profile,
    });
  } catch (error) {
    if (error instanceof SchemaValidationError) {
      res.status(422).json({
        status: "error",
        message: error.message,
        issues: error.issues,
      });
      return;
    }

    if (error instanceof UpstreamAIError) {
      res.status(502).json({
        status: "error",
        message: error.message,
      });
      return;
    }

    console.error("Unexpected error in structured endpoint:", error);
    res.status(500).json({
      status: "error",
      message: "An unexpected internal error occurred",
    });
  }
});

