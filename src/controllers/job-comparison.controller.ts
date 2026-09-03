import { Request, Response } from "express";
import { compareStoredJob } from "../services/job-comparison.service.js";
import type { JobComparisonRequestInput } from "../schemas/job-comparison-request.schema.js";

/**
 * Controller: Handles POST /jobs/compare - Compares an already-indexed resume
 * against target job description.
 * Note: Request body validation is handled upstream by `validateBody(JobComparisonRequestSchema)`.
 */
export async function compareJobDescriptionHandler(
  req: Request<unknown, unknown, JobComparisonRequestInput>,
  res: Response,
): Promise<void> {
  const { documentId, jobDescription } = req.body;

  const comparison = await compareStoredJob(documentId, jobDescription);

  res.status(200).json({
    status: "success",
    message: "Job description comparison completed successfully",
    data: comparison,
  });
}
