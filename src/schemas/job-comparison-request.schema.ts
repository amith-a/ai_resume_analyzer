import { z } from "zod";

/**
 * Zod schema for validating POST /jobs/compare request body.
 */
export const JobComparisonRequestSchema = z.object({
  documentId: z
    .string({ message: "Document ID must be a non-empty string" })
    .trim()
    .min(1, "Document ID must be a non-empty string"),

  jobDescription: z
    .string({ message: "Job description must be a non-empty string" })
    .trim()
    .min(1, "Job description must be a non-empty string"),
});

export type JobComparisonRequestInput = z.infer<typeof JobComparisonRequestSchema>;

// Backward-compatible aliases
export const CompareJobRequestSchema = JobComparisonRequestSchema;
export type CompareJobRequestInput = JobComparisonRequestInput;
