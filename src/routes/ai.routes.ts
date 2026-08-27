import { Router, Request, Response } from "express";
import { generateText } from "../ai/ollama.js";
import { generateLangChainText } from "../ai/langchain.js";

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
