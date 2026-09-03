import { z } from "zod";

/**
 * Zod validation schema for POST /resumes/analyze request payload.
 */
export const AnalyzeResumeRequestSchema = z.object({
  documentId: z
    .string({
      message: "Document ID must be a non-empty string",
    })
    .trim()
    .min(1, "Document ID must be a non-empty string"),
});

export type AnalyzeResumeRequestInput = z.infer<typeof AnalyzeResumeRequestSchema>;
