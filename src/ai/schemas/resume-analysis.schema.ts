import { z } from "zod";

export const ExperienceSchema = z.object({
  company: z.string().describe("Name of the company or organization"),
  role: z.string().describe("Job title or role held by the candidate"),
  startYear: z
    .number()
    .nullable()
    .describe("Start year of employment (e.g. 2020), or null if not stated"),
  endYear: z
    .number()
    .nullable()
    .describe("End year of employment (e.g. 2023), or null if present/not stated"),
  description: z.string().describe("Key responsibilities, projects, and achievements in this role"),
});

export const EducationSchema = z.object({
  institution: z.string().describe("University, college, or educational institution name"),
  degree: z.string().describe("Degree obtained or pursued (e.g. B.S., M.S., High School Diploma)"),
  field: z.string().describe("Major or field of study (e.g. Computer Science, Physics)"),
  startYear: z.number().nullable().describe("Start year of study, or null if not stated"),
  endYear: z.number().nullable().describe("Graduation year or end year, or null if not stated"),
});

export const ProjectSchema = z.object({
  name: z.string().describe("Name or title of the project"),
  description: z
    .string()
    .describe("Overview of what the project does and candidate's contributions"),
  technologies: z
    .array(z.string())
    .describe("List of technologies, frameworks, and tools used in this project"),
});

export const ResumeAnalysisSchema = z.object({
  candidateSummary: z
    .string()
    .describe("Professional summary and executive overview of the candidate"),
  skills: z.array(z.string()).describe("Comprehensive list of technical and professional skills"),
  experience: z
    .array(ExperienceSchema)
    .describe("Chronological or relevant work experience history"),
  education: z.array(EducationSchema).describe("Academic background, degrees, and institutions"),
  projects: z.array(ProjectSchema).describe("Notable personal, academic, or professional projects"),
  technologies: z
    .array(z.string())
    .describe("Explicit list of all programming languages, tools, frameworks, and databases"),
  certifications: z
    .array(z.string())
    .describe("Professional licenses, certifications, and credentials"),
  strengths: z.array(z.string()).describe("Identified candidate strengths and core competencies"),
  missingOrUnclear: z
    .array(z.string())
    .describe("Gaps, missing dates, or ambiguous details noted in the resume"),
});

export type Experience = z.infer<typeof ExperienceSchema>;
export type Education = z.infer<typeof EducationSchema>;
export type Project = z.infer<typeof ProjectSchema>;
export type ResumeAnalysis = z.infer<typeof ResumeAnalysisSchema>;
