import { Router } from "express";
import { resumeUploadMiddleware } from "../middlewares/upload.middleware.js";
import { validateRequest } from "../middlewares/validation.middleware.js";
import {
  AskResumeParamsSchema,
  AskResumeBodySchema,
} from "../schemas/ask-resume-request.schema.js";
import {
  extractResumeHandler,
  analyzeResumeHandler,
  askResumeHandler,
} from "../controllers/resume.controller.js";

export const resumeRouter = Router();

// POST /resumes - Ingest, extract, and normalize resume text
resumeRouter.post("/", resumeUploadMiddleware, extractResumeHandler);

// POST /resumes/analyze - Ingest, normalize, and analyze resume using structured LLM schema
resumeRouter.post("/analyze", resumeUploadMiddleware, analyzeResumeHandler);

// POST /resumes/:id/ask - Scoped RAG question answering for an indexed resume
resumeRouter.post(
  "/:id/ask",
  validateRequest({
    params: AskResumeParamsSchema,
    body: AskResumeBodySchema,
  }),
  askResumeHandler,
);
