import { z } from "zod";

export const CandidateProfileSchema = z.object({
  name: z.string().describe("Full name of the candidate"),
  summary: z.string().describe("Brief professional summary or headline"),
  skills: z.object({
    technical: z
      .array(z.string())
      .describe("List of technical skills, languages, tools, frameworks"),
    soft: z
      .array(z.string())
      .describe("List of soft skills, domain abilities, or interpersonal skills"),
  }),
  yearsOfExperience: z
    .number()
    .nullable()
    .describe("Total estimated years of experience, or null if not stated"),
  education: z
    .array(
      z.object({
        degree: z.string().describe("Degree title or certificate name"),
        field: z.string().describe("Field of study or major"),
        institution: z
          .string()
          .describe("University, college, or institution name"),
        graduationYear: z
          .number()
          .nullable()
          .describe("Year of graduation if specified, else null"),
      })
    )
    .describe("Educational background and degrees"),
});

export type CandidateProfile = z.infer<typeof CandidateProfileSchema>;
