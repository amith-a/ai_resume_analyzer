import { Router } from "express";
import { retrieveChunksHandler } from "../controllers/retrieval.controller.js";

export const retrievalRouter = Router();

// POST /retrieval/chunks - Query document chunks by natural-language similarity
retrievalRouter.post("/chunks", retrieveChunksHandler);
