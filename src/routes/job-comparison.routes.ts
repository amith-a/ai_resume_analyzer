import { Router } from "express";
import { resumeUploadMiddleware } from "../middlewares/upload.middleware.js";
import { compareJobDescriptionHandler } from "../controllers/job-comparison.controller.js";

export const jobComparisonRouter = Router();

// POST /jobs/compare - Ingest resume file and compare against job description
jobComparisonRouter.post(
  "/compare",
  resumeUploadMiddleware,
  compareJobDescriptionHandler
);
