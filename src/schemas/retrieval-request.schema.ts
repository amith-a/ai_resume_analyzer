import { z } from "zod";

/**
 * Zod schema for validating POST /retrieval/chunks request payload.
 */
export const RetrieveChunksRequestSchema = z.object({
  query: z
    .string({ message: "Query must be a non-empty string" })
    .trim()
    .min(1, "Query must be a non-empty string"),
  documentId: z
    .string({ message: "Document ID must be a non-empty string" })
    .trim()
    .min(1, "Document ID must be a non-empty string"),
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

export type RetrieveChunksRequestInput = z.infer<typeof RetrieveChunksRequestSchema>;
