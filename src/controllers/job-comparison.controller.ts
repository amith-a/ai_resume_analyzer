import { Request, Response } from "express";
import { ingestResumeDocument } from "../services/resume-ingest.service.js";
import { compareJobDescription } from "../services/job-comparison.service.js";
import type { CompareJobRequestInput } from "../schemas/job-comparison-request.schema.js";

/**
 * Controller: Handles POST /jobs/compare - Ingests resume file, extracts text,
 * and compares it against target job description.
 * Note: Request body validation is handled upstream by `validateBody(CompareJobRequestSchema)`.
 */
export async function compareJobDescriptionHandler(
  req: Request<unknown, unknown, CompareJobRequestInput>,
  res: Response,
): Promise<void> {
  const { jobDescription } = req.body;

  const doc = await ingestResumeDocument(req.file!.buffer);
  const comparison = await compareJobDescription(doc.normalizedText, jobDescription);

  res.status(200).json({
    status: "success",
    message: "Job description comparison completed successfully",
    data: comparison,
  });
}
