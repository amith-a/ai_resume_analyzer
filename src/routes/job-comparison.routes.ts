import { Router } from "express";
import { validateBody } from "../middlewares/validation.middleware.js";
import { JobComparisonRequestSchema } from "../schemas/job-comparison-request.schema.js";
import { compareJobDescriptionHandler } from "../controllers/job-comparison.controller.js";

export const jobComparisonRouter = Router();

// POST /jobs/compare - Compare an already-indexed resume against target job description
jobComparisonRouter.post(
  "/compare",
  validateBody(JobComparisonRequestSchema),
  compareJobDescriptionHandler,
);
