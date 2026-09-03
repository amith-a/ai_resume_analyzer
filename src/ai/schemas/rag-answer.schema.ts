import { z } from "zod";

/**
 * Zod schema for structured RAG generation output.
 */
export const RagAnswerSchema = z.object({
  answer: z
    .string({
      message: "Answer must be a string",
    })
    .describe(
      "The concise, factual final answer to the user question based strictly on the resume context. Do not include reasoning steps, search process, or meta-commentary.",
    ),
});

export type RagAnswer = z.infer<typeof RagAnswerSchema>;
