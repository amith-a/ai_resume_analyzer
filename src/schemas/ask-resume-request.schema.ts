import { z } from "zod";

export const AskResumeParamsSchema = z.object({
  id: z
    .string({
      message: "Resume ID is required",
    })
    .trim()
    .min(1, "Resume ID must be a non-empty string"),
});

export const AskResumeBodySchema = z.object({
  query: z
    .string({
      message: "Query must be a non-empty string",
    })
    .trim()
    .min(1, "Query must be a non-empty string")
    .max(1000, "Query cannot exceed 1000 characters"),
  topK: z
    .number({ message: "topK must be a positive integer" })
    .int("topK must be a positive integer")
    .positive("topK must be a positive integer")
    .optional(),
  maxDistanceThreshold: z
    .number({ message: "maxDistanceThreshold must be a non-negative finite number" })
    .nonnegative("maxDistanceThreshold must be a non-negative finite number")
    .optional(),
  metadataFilter: z
    .custom<Record<string, unknown>>(
      (val) => typeof val === "object" && val !== null && !Array.isArray(val),
      { message: "metadataFilter must be a valid object" },
    )
    .optional(),
});

export type AskResumeParams = z.infer<typeof AskResumeParamsSchema>;
export type AskResumeBody = z.infer<typeof AskResumeBodySchema>;
