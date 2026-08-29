import { Request, Response } from "express";
import { ingestResumeDocument } from "../services/resume-ingest.service.js";
import { compareJobDescription } from "../services/job-comparison.service.js";

/**
 * Controller: Handles POST /jobs/compare - Ingests resume file, extracts text,
 * and compares it against target job description.
 * Express 5 natively catches unhandled async rejections and forwards them to errorHandlerMiddleware.
 */
export async function compareJobDescriptionHandler(
  req: Request,
  res: Response
): Promise<void> {
  const jobDescription = req.body?.jobDescription;

  if (
    !jobDescription ||
    typeof jobDescription !== "string" ||
    jobDescription.trim().length === 0
  ) {
    res.status(400).json({
      status: "error",
      message: "Job description must be a non-empty string",
    });
    return;
  }

  const doc = await ingestResumeDocument(req.file!.buffer);
  const comparison = await compareJobDescription(
    doc.normalizedText,
    jobDescription.trim()
  );

  res.status(200).json({
    status: "success",
    message: "Job description comparison completed successfully",
    data: comparison,
  });
}
