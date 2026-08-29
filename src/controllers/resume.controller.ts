import { Request, Response } from "express";
import { ingestResumeDocument } from "../services/resume-ingest.service.js";
import { analyzeResume } from "../services/resume-analyzer.service.js";

/**
 * Controller: Handles POST /resumes - Ingests, extracts, and normalizes resume text.
 * Note: Express 5 natively catches unhandled async rejections and forwards them to errorHandlerMiddleware.
 */
export async function extractResumeHandler(
  req: Request,
  res: Response
): Promise<void> {
  const doc = await ingestResumeDocument(req.file!.buffer);

  res.status(200).json({
    status: "success",
    message: "Resume text extracted and normalized successfully",
    data: {
      filename: req.file!.originalname,
      size: req.file!.size,
      detectedMime: doc.detectedMime,
      detectedExt: doc.detectedExt,
      characterCount: doc.characterCount,
      ...(doc.pageCount !== undefined ? { pageCount: doc.pageCount } : {}),
      text: doc.normalizedText,
    },
  });
}

/**
 * Controller: Handles POST /resumes/analyze - Ingests, normalizes, and analyzes resume with LLM.
 * Note: Express 5 natively catches unhandled async rejections and forwards them to errorHandlerMiddleware.
 */
export async function analyzeResumeHandler(
  req: Request,
  res: Response
): Promise<void> {
  const doc = await ingestResumeDocument(req.file!.buffer);
  const analysis = await analyzeResume(doc.normalizedText);

  res.status(200).json({
    status: "success",
    message: "Resume analyzed successfully",
    data: analysis,
  });
}

