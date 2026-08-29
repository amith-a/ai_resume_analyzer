import { z } from "zod";

/**
 * Input schema for comparing a resume against a job description.
 */
export const JobComparisonInputSchema = z.object({
  resumeText: z
    .string()
    .trim()
    .min(1, "Resume text must be a non-empty string")
    .describe("Extracted and normalized plain text of the candidate's resume"),
  jobDescription: z
    .string()
    .trim()
    .min(1, "Job description must be a non-empty string")
    .describe("Plain text of the job description or requirements"),
});

/**
 * Sub-schema for individual relevant work experience items matching the job description.
 */
export const RelevantExperienceSchema = z.object({
  role: z.string().describe("Role or job title held by the candidate"),
  company: z
    .string()
    .optional()
    .describe("Company or organization name (optional if not identified)"),
  years: z
    .number()
    .optional()
    .describe("Duration or relevant years in this role (optional if not stated)"),
  relevance: z
    .string()
    .describe("Explanation of how this experience relates to the job requirements"),
});

/**
 * Sub-schema for individual relevant project items matching the job description.
 */
export const RelevantProjectSchema = z.object({
  name: z.string().describe("Name or title of the project"),
  relevance: z
    .string()
    .describe("Explanation of how this project demonstrates relevant skills for the job"),
});

/**
 * Output schema for the structured LLM job description comparison result.
 */
export const JobComparisonOutputSchema = z.object({
  matchedSkills: z
    .array(z.string())
    .describe("Skills explicitly found in both the resume and the job description"),
  missingSkills: z
    .array(z.string())
    .describe("Required or preferred skills in the job description that are absent from the resume"),
  relevantExperience: z
    .array(RelevantExperienceSchema)
    .describe("Candidate work experience entries that directly align with the job requirements"),
  experienceGaps: z
    .array(z.string())
    .describe("Areas where the candidate's experience falls short of job requirements (e.g. seniority, domain)"),
  relevantProjects: z
    .array(RelevantProjectSchema)
    .describe("Projects from the resume that demonstrate skills or domain knowledge relevant to the job"),
  strengths: z
    .array(z.string())
    .describe("Key candidate strengths and strong alignment points for this specific role"),
  gaps: z
    .array(z.string())
    .describe("Critical gaps or unfulfilled qualifications between the candidate and the job description"),
  improvementSuggestions: z
    .array(z.string())
    .describe("Actionable suggestions for the candidate to better align with or prepare for this role"),
  overallFit: z
    .enum(["strong", "moderate", "weak"])
    .describe("Categorical assessment of candidate fit for the target role ('strong', 'moderate', or 'weak')"),
});

export type JobComparisonInput = z.infer<typeof JobComparisonInputSchema>;
export type RelevantExperience = z.infer<typeof RelevantExperienceSchema>;
export type RelevantProject = z.infer<typeof RelevantProjectSchema>;
export type JobComparisonOutput = z.infer<typeof JobComparisonOutputSchema>;
