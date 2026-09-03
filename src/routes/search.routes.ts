import { Router } from "express";
import { validateBody } from "../middlewares/validation.middleware.js";
import { RetrieveChunksRequestSchema } from "../schemas/retrieval-request.schema.js";
import { retrieveChunksHandler } from "../controllers/retrieval.controller.js";

export const searchRouter = Router();

searchRouter.post("/chunks", validateBody(RetrieveChunksRequestSchema), retrieveChunksHandler);
