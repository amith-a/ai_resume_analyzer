import { Router } from "express";
import { resumeUploadMiddleware } from "../middlewares/upload.middleware.js";
import { validateBody } from "../middlewares/validation.middleware.js";
import { CompareJobRequestSchema } from "../schemas/job-comparison-request.schema.js";
import { compareJobDescriptionHandler } from "../controllers/job-comparison.controller.js";

export const jobComparisonRouter = Router();

// POST /jobs/compare - Ingest resume file and compare against job description
jobComparisonRouter.post(
  "/compare",
  resumeUploadMiddleware,
  validateBody(CompareJobRequestSchema),
  compareJobDescriptionHandler
);

