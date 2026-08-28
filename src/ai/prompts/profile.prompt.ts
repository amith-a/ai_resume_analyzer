import { ChatPromptTemplate } from "@langchain/core/prompts";

export const profileExtractionPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `You are an expert resume parsing engine. Your task is to extract structured candidate profile information strictly from the provided text.

Guidelines:
1. Extract only facts directly stated in the text.
2. If any field or detail is not provided, use null for nullable fields or an empty list [] for array fields.
3. Do not invent, extrapolate, or assume candidate credentials or experiences.
4. Output must conform strictly to the required structured format without commentary.`,
  ],
  ["human", "Candidate Text:\n{text}"],
]);
