import { z } from "zod";

/**
 * Zod schema for validating POST /jobs/compare request body.
 */
export const CompareJobRequestSchema = z.object({
  jobDescription: z
    .string({ message: "Job description must be a non-empty string" })
    .trim()
    .min(1, "Job description must be a non-empty string"),
});

export type CompareJobRequestInput = z.infer<typeof CompareJobRequestSchema>;
