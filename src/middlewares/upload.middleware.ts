import { Request, Response, NextFunction } from "express";
import multer from "multer";

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
 * handles 5MB size limit errors (413), general upload errors (400),
 * and validates that a resume file was provided in the request body (400).
 */
export function resumeUploadMiddleware(req: Request, res: Response, next: NextFunction): void {
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

    if (!req.file) {
      res.status(400).json({
        status: "error",
        message: "No resume file provided",
      });
      return;
    }

    next();
  });
}
