import type { Request, Response, NextFunction } from "express";
import multer from "multer";
import { FileUploadError } from "../errors/index.js";

export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

const storage = multer.memoryStorage();

export const uploadResumeFile = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
  },
}).single("file");

/**
 * Production middleware: Encapsulates Multer file upload execution,
 * forwarding Multer errors (413/400) and missing-file errors (400)
 * directly into the centralized Express error handling flow.
 */
export function resumeUploadMiddleware(req: Request, res: Response, next: NextFunction): void {
  uploadResumeFile(req, res, (err) => {
    if (err) {
      return next(err);
    }

    if (!req.file) {
      return next(new FileUploadError("No resume file provided"));
    }

    next();
  });
}
