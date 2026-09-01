import { Router, Request, Response } from "express";
import { pool } from "../config/db.js";
import { env } from "../config/env.js";

export const healthRouter = Router();

// GET /health - API process liveness
healthRouter.get("/", (_req: Request, res: Response) => {
  res.status(200).json({ status: "ok" });
});

// GET /health/db - PostgreSQL connectivity and pgvector check
healthRouter.get("/db", async (_req: Request, res: Response) => {
  try {
    await pool.query("SELECT 1");
    const extResult = await pool.query<{ extversion: string }>(
      "SELECT extversion FROM pg_extension WHERE extname = 'vector'",
    );

    const pgvectorVersion =
      extResult.rows.length > 0 ? extResult.rows[0].extversion : "not installed";

    res.status(200).json({
      status: "ok",
      database: "connected",
      pgvector: pgvectorVersion,
    });
  } catch (error: unknown) {
    console.error("Database health check failed:", error);
    res.status(500).json({
      status: "error",
      database: "disconnected",
    });
  }
});

// GET /health/ollama - Ollama reachability and model availability check
healthRouter.get("/ollama", async (_req: Request, res: Response) => {
  try {
    const response = await fetch(`${env.OLLAMA_HOST}/api/tags`);
    if (!response.ok) {
      res.status(500).json({ status: "error", ollama: "unreachable" });
      return;
    }
    const data = (await response.json()) as { models?: { name: string }[] };
    const hasModel = data.models?.some((m) => m.name.startsWith(env.OLLAMA_MODEL)) ?? false;

    res.status(hasModel ? 200 : 500).json({
      status: hasModel ? "ok" : "error",
      ollama: "reachable",
      model: hasModel ? "available" : "not pulled",
    });
  } catch (error: unknown) {
    console.error("Ollama health check failed:", error);
    res.status(500).json({ status: "error", ollama: "unreachable" });
  }
});
