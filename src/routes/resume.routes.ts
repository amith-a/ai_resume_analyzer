import { Router } from "express";
import { resumeUploadMiddleware } from "../middlewares/upload.middleware.js";
import {
  extractResumeHandler,
  analyzeResumeHandler,
} from "../controllers/resume.controller.js";

export const resumeRouter = Router();

// POST /resumes - Ingest, extract, and normalize resume text
resumeRouter.post("/", resumeUploadMiddleware, extractResumeHandler);

// POST /resumes/analyze - Ingest, normalize, and analyze resume using LLM
resumeRouter.post("/analyze", resumeUploadMiddleware, analyzeResumeHandler);
