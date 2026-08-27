import "dotenv/config";
import express, { Request, Response } from "express";
import pg from "pg";
import { generateText } from "./ai/ollama.js";
import { generateLangChainText } from "./ai/langchain.js";

const { Pool } = pg;

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

const dbUrl =
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@postgres:5432/resume_db";
const pool = new Pool({
  connectionString: dbUrl,
});

pool.on("error", (err) => {
  console.error("Unexpected error on idle PostgreSQL client", err);
});

// POST /ai/test - test direct Ollama fetch connectivity
app.post("/ai/test", async (req: Request, res: Response) => {
  try {
    const prompt = typeof req.body?.prompt === "string" ? req.body.prompt : "hello";
    const response = await generateText(prompt);
    res.status(200).json({ engine: "fetch", data: response });
  } catch (error) {
    console.error("AI test endpoint failed:", error);
    res.status(502).json({ status: "error", message: "LLM request failed" });
  }
});

// POST /ai/langchain/test - test LangChain Ollama connectivity
app.post("/ai/langchain/test", async (req: Request, res: Response) => {
  try {
    const prompt = typeof req.body?.prompt === "string" ? req.body.prompt : "hello";
    const response = await generateLangChainText(prompt);
    res.status(200).json({ engine: "langchain", data: response });
  } catch (error) {
    console.error("LangChain test endpoint failed:", error);
    res.status(502).json({ status: "error", message: "LLM request failed" });
  }
});

// GET /health - API process liveness
app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({ status: "ok" });
});

// GET /health/db - PostgreSQL connectivity check
app.get("/health/db", async (_req: Request, res: Response) => {
  try {
    await pool.query("SELECT 1");
    res.status(200).json({
      status: "ok",
      database: "connected",
    });
  } catch (error) {
    console.error("Database health check failed:", error);
    res.status(500).json({
      status: "error",
      database: "disconnected",
    });
  }
});

// GET /health/ollama - Ollama reachability check
app.get("/health/ollama", async (_req: Request, res: Response) => {
  const ollamaHost = process.env.OLLAMA_HOST || "http://ollama:11434";
  try {
    const response = await fetch(ollamaHost);
    if (response.ok || response.status < 500) {
      res.status(200).json({
        status: "ok",
        ollama: "reachable",
      });
    } else {
      res.status(500).json({
        status: "error",
        ollama: "unreachable",
      });
    }
  } catch (error) {
    console.error("Ollama health check failed:", error);
    res.status(500).json({
      status: "error",
      ollama: "unreachable",
    });
  }
});

const server = app.listen(port, () => {
  console.log(
    `Server listening on port ${port} in ${process.env.NODE_ENV || "development"} mode`,
  );
});

const gracefulShutdown = async (signal: string) => {
  console.log(`Received ${signal}. Starting graceful shutdown...`);

  if (server.closeAllConnections) {
    server.closeAllConnections();
  }

  server.close(async () => {
    console.log("HTTP server closed.");
    try {
      await pool.end();
      console.log("PostgreSQL connection pool drained.");
      process.exit(0);
    } catch (err) {
      console.error("Error closing PostgreSQL pool:", err);
      process.exit(1);
    }
  });

  setTimeout(() => {
    console.error("Forced shutdown due to timeout");
    process.exit(1);
  }, 3000);
};

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
