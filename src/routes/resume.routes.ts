import { Router, Request, Response, NextFunction } from "express";
import multer from "multer";
import { uploadResumeFile } from "../middlewares/upload.middleware.js";
import { validateResumeBuffer } from "../utils/file-validator.util.js";
import {
  extractTextFromDocument,
  DocumentExtractionError,
} from "../services/extractor.service.js";
import { normalizeResumeText } from "../utils/text-normalizer.util.js";
import * as analyzerService from "../services/resume-analyzer.service.js";
import { UpstreamAIError, SchemaValidationError } from "../ai/errors.js";

export const resumeRouter = Router();

// Reusable Multer error handler middleware
const handleUpload = (req: Request, res: Response, next: NextFunction) => {
  uploadResumeFile(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          res.status(413).json({
            status: "error",
            message: "File size exceeds limit of 5MB",
          });
          return;
        }
        res.status(400).json({
          status: "error",
          message: err.message,
        });
        return;
      }
      console.error("Unexpected error during file upload:", err);
      res.status(500).json({
        status: "error",
        message: "An unexpected error occurred during file upload",
      });
      return;
    }
    next();
  });
};

// POST /resumes - Receive, validate, extract, and normalize resume file text
resumeRouter.post("/", handleUpload, async (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({
      status: "error",
      message: "No resume file provided",
    });
    return;
  }

  try {
    const validation = await validateResumeBuffer(req.file.buffer);

    if (!validation.isValid || !validation.detectedMime) {
      res.status(415).json({
        status: "error",
        message: validation.error ?? "Unsupported file type",
      });
      return;
    }

    try {
      const extraction = await extractTextFromDocument(
        req.file.buffer,
        validation.detectedMime
      );

      const normalizedText = normalizeResumeText(extraction.text);

      res.status(200).json({
        status: "success",
        message: "Resume text extracted and normalized successfully",
        data: {
          filename: req.file.originalname,
          size: req.file.size,
          detectedMime: validation.detectedMime,
          detectedExt: validation.detectedExt,
          characterCount: normalizedText.length,
          ...(extraction.pageCount !== undefined
            ? { pageCount: extraction.pageCount }
            : {}),
          text: normalizedText,
        },
      });
    } catch (extractError) {
      if (extractError instanceof DocumentExtractionError) {
        res.status(422).json({
          status: "error",
          message: extractError.message,
        });
        return;
      }
      throw extractError;
    }
  } catch (error) {
    console.error("File processing failed unexpectedly:", error);
    res.status(500).json({
      status: "error",
      message: "An unexpected error occurred during file processing",
    });
  }
});

// POST /resumes/analyze - Ingest, extract, normalize, and analyze resume with LLM
resumeRouter.post(
  "/analyze",
  handleUpload,
  async (req: Request, res: Response) => {
    if (!req.file) {
      res.status(400).json({
        status: "error",
        message: "No resume file provided",
      });
      return;
    }

    try {
      const validation = await validateResumeBuffer(req.file.buffer);

      if (!validation.isValid || !validation.detectedMime) {
        res.status(415).json({
          status: "error",
          message: validation.error ?? "Unsupported file type",
        });
        return;
      }

      let normalizedText: string;
      try {
        const extraction = await extractTextFromDocument(
          req.file.buffer,
          validation.detectedMime
        );
        normalizedText = normalizeResumeText(extraction.text);
      } catch (extractError) {
        if (extractError instanceof DocumentExtractionError) {
          res.status(422).json({
            status: "error",
            message: extractError.message,
          });
          return;
        }
        throw extractError;
      }

      try {
        const analysis = await analyzerService.analyzeResume(normalizedText);

        res.status(200).json({
          status: "success",
          message: "Resume analyzed successfully",
          data: analysis,
        });
      } catch (aiError) {
        if (aiError instanceof UpstreamAIError) {
          res.status(502).json({
            status: "error",
            message: "AI service is currently unavailable or timed out",
          });
          return;
        }

        if (aiError instanceof SchemaValidationError) {
          res.status(422).json({
            status: "error",
            message: "AI output failed schema validation",
            issues: aiError.issues,
          });
          return;
        }

        throw aiError;
      }
    } catch (error) {
      console.error("Resume analysis pipeline failed unexpectedly:", error);
      res.status(500).json({
        status: "error",
        message: "An unexpected error occurred during resume analysis",
      });
    }
  }
);



