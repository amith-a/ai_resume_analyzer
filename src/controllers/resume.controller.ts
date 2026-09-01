import { Request, Response } from "express";
import { ingestResumeDocument } from "../services/resume-ingest.service.js";
import { analyzeResume } from "../services/resume-analyzer.service.js";
import { storeDocumentWithChunks } from "../services/document-storage.service.js";

/**
 * Controller: Handles POST /resumes - Ingests, extracts, normalizes, and indexes resume with chunks & embeddings.
 * Note: Express 5 natively catches unhandled async rejections and forwards them to errorHandlerMiddleware.
 */
export async function extractResumeHandler(req: Request, res: Response): Promise<void> {
  const doc = await ingestResumeDocument(req.file!.buffer);

  const storage = await storeDocumentWithChunks({
    title: req.file!.originalname,
    document_type: "resume",
    raw_text: doc.normalizedText,
    metadata: {
      filename: req.file!.originalname,
      fileSize: req.file!.size,
      mimeType: doc.detectedMime,
      extension: doc.detectedExt,
      characterCount: doc.characterCount,
      ...(doc.pageCount !== undefined ? { pageCount: doc.pageCount } : {}),
    },
  });

  res.status(200).json({
    status: "success",
    message: "Resume processed and indexed successfully",
    data: {
      documentId: storage.document.id,
      filename: req.file!.originalname,
      size: req.file!.size,
      detectedMime: doc.detectedMime,
      detectedExt: doc.detectedExt,
      characterCount: doc.characterCount,
      ...(doc.pageCount !== undefined ? { pageCount: doc.pageCount } : {}),
      chunkCount: storage.chunks.length,
      text: doc.normalizedText,
    },
  });
}

/**
 * Controller: Handles POST /resumes/analyze - Ingests, normalizes, and analyzes resume with LLM.
 * Note: Express 5 natively catches unhandled async rejections and forwards them to errorHandlerMiddleware.
 */
export async function analyzeResumeHandler(req: Request, res: Response): Promise<void> {
  const doc = await ingestResumeDocument(req.file!.buffer);
  const analysis = await analyzeResume(doc.normalizedText);

  res.status(200).json({
    status: "success",
    message: "Resume analyzed successfully",
    data: analysis,
  });
}
