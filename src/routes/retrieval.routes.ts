import { Router } from "express";
import { validateBody } from "../middlewares/validation.middleware.js";
import { RetrieveChunksRequestSchema } from "../schemas/retrieval-request.schema.js";
import { retrieveChunksHandler } from "../controllers/retrieval.controller.js";

export const retrievalRouter = Router();

// POST /retrieval/chunks - Query document chunks by natural-language similarity
retrievalRouter.post("/chunks", validateBody(RetrieveChunksRequestSchema), retrieveChunksHandler);
