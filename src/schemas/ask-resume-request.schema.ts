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
    .min(1, "Query must be a non-empty string"),
});

export type AskResumeParams = z.infer<typeof AskResumeParamsSchema>;
export type AskResumeBody = z.infer<typeof AskResumeBodySchema>;
