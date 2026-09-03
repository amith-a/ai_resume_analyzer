import { Request, Response } from "express";
import { ingestResumeDocument } from "../services/resume-ingest.service.js";
import { storeDocumentWithChunks } from "../services/document-storage.service.js";
import { analyzeStoredResume } from "../services/resume-analyzer.service.js";
import { orchestrateRagRetrieval } from "../services/rag-retrieval.service.js";
import { limitContextChunks } from "../utils/context-limiter.util.js";
import { constructContext } from "../utils/context-builder.util.js";
import { generateRagAnswer } from "../services/rag-generation.service.js";
import {
  produceGroundedAnswer,
  GROUNDING_FALLBACK_TEXT,
} from "../services/grounded-answer.service.js";
import { trackSources } from "../services/source-tracker.service.js";
import { checkGrounding } from "../services/grounding-check.service.js";
import type { AskResumeParams, AskResumeBody } from "../schemas/ask-resume-request.schema.js";
import type { AnalyzeResumeRequestInput } from "../schemas/analyze-resume-request.schema.js";

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
 * Controller: Handles POST /resumes/analyze - Performs structured profile extraction on an already-indexed resume.
 * Note: Express 5 natively catches unhandled async rejections and forwards them to errorHandlerMiddleware.
 */
export async function analyzeResumeHandler(
  req: Request<unknown, unknown, AnalyzeResumeRequestInput>,
  res: Response,
): Promise<void> {
  const { documentId } = req.body;
  const analysis = await analyzeStoredResume(documentId);

  res.status(200).json({
    status: "success",
    message: "Resume analyzed successfully",
    data: analysis,
  });
}

/**
 * Controller: Handles POST /resumes/:id/ask - Scoped RAG question answering for an already-indexed resume.
 * Note: Express 5 natively catches unhandled async rejections and forwards them to errorHandlerMiddleware.
 */
export async function askResumeHandler(
  req: Request<AskResumeParams, unknown, AskResumeBody>,
  res: Response,
): Promise<void> {
  const { id } = req.params;
  const { query } = req.body;

  // 1. Retrieve relevant chunks scoped strictly to the requested document ID
  const retrievedChunks = await orchestrateRagRetrieval({
    query,
    documentId: id,
  });

  // 2. Apply context budget limits
  const { chunks: limitedChunks } = limitContextChunks(retrievedChunks);

  // 3. Construct formatted context string from limited chunks
  const formattedContext = constructContext(limitedChunks);

  // 4. Generate answer using RAG chat model
  const generationResult = await generateRagAnswer({
    query,
    context: formattedContext,
  });

  // 5. Enforce grounding fallback if no usable context exists or answer is empty
  const hasUsableContext = limitedChunks.length > 0;
  const groundedResult = produceGroundedAnswer({
    answer: generationResult.answer,
    hasUsableContext,
  });

  // 6. Enforce lexical grounding check on candidate answer
  let finalAnswer = groundedResult.answer;
  let isGrounded = false;

  if (finalAnswer !== GROUNDING_FALLBACK_TEXT && hasUsableContext) {
    const check = checkGrounding({
      answer: finalAnswer,
      context: formattedContext,
    });
    isGrounded = check.grounded;
    if (!isGrounded) {
      finalAnswer = GROUNDING_FALLBACK_TEXT;
    }
  }

  // 7. Track sources exclusively when answer is grounded and available
  const activeChunks = isGrounded ? limitedChunks : [];

  const finalResult = trackSources({
    answer: finalAnswer,
    chunks: activeChunks,
  });

  res.status(200).json({
    status: "success",
    data: finalResult,
  });
}
