import { describe, it } from "node:test";
import assert from "node:assert";
import {
  ResumeAnalysisSchema,
  ExperienceSchema,
  EducationSchema,
  ProjectSchema,
  ResumeAnalysis,
} from "../src/ai/schemas/resume-analysis.schema.js";

describe("ResumeAnalysisSchema Validation", () => {
  it("1. validates a complete and valid ResumeAnalysis object", () => {
    const validData: ResumeAnalysis = {
      candidateSummary: "Senior Full Stack Engineer with 8 years of experience.",
      skills: ["TypeScript", "Node.js", "React", "PostgreSQL", "Docker"],
      experience: [
        {
          company: "Tech Corp",
          role: "Senior Engineer",
          startYear: 2021,
          endYear: null,
          description: "Led development of core microservices and API gateways.",
        },
        {
          company: "StartUp Inc",
          role: "Software Developer",
          startYear: 2017,
          endYear: 2021,
          description: "Built REST APIs and scalable backend architectures.",
        },
      ],
      education: [
        {
          institution: "MIT",
          degree: "B.S.",
          field: "Computer Science",
          startYear: 2013,
          endYear: 2017,
        },
      ],
      projects: [
        {
          name: "Resume Analyzer",
          description: "AI-powered resume parsing and analysis engine.",
          technologies: ["TypeScript", "LangChain", "Ollama"],
        },
      ],
      technologies: ["Node.js", "Express", "PostgreSQL", "Docker", "Git"],
      certifications: ["AWS Certified Solutions Architect"],
      strengths: ["System Architecture", "API Design", "Distributed Systems"],
      missingOrUnclear: ["Missing details about high school education"],
    };

    const result = ResumeAnalysisSchema.safeParse(validData);
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.data.candidateSummary, validData.candidateSummary);
      assert.equal(result.data.experience.length, 2);
      assert.equal(result.data.education.length, 1);
      assert.equal(result.data.projects.length, 1);
    }
  });

  it("2. accepts null for unavailable startYear and endYear fields", () => {
    const dataWithNullYears = {
      candidateSummary: "Self-taught developer.",
      skills: ["Python", "FastAPI"],
      experience: [
        {
          company: "Freelance",
          role: "Developer",
          startYear: null,
          endYear: null,
          description: "Built custom websites and scrapers.",
        },
      ],
      education: [
        {
          institution: "Online Bootcamp",
          degree: "Certificate",
          field: "Web Development",
          startYear: null,
          endYear: null,
        },
      ],
      projects: [],
      technologies: ["Python", "HTML", "CSS"],
      certifications: [],
      strengths: ["Fast learner"],
      missingOrUnclear: ["Employment start/end dates are not listed"],
    };

    const result = ResumeAnalysisSchema.safeParse(dataWithNullYears);
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.data.experience[0].startYear, null);
      assert.equal(result.data.experience[0].endYear, null);
      assert.equal(result.data.education[0].startYear, null);
      assert.equal(result.data.education[0].endYear, null);
    }
  });

  it("3. accepts empty arrays for sections when no items exist", () => {
    const minimalData = {
      candidateSummary: "Junior candidate seeking first role.",
      skills: ["Java"],
      experience: [],
      education: [],
      projects: [],
      technologies: ["Java", "IntelliJ"],
      certifications: [],
      strengths: ["Enthusiastic"],
      missingOrUnclear: ["No prior work experience or formal education listed"],
    };

    const result = ResumeAnalysisSchema.safeParse(minimalData);
    assert.equal(result.success, true);
    if (result.success) {
      assert.deepEqual(result.data.experience, []);
      assert.deepEqual(result.data.education, []);
      assert.deepEqual(result.data.projects, []);
      assert.deepEqual(result.data.certifications, []);
    }
  });

  it("4. rejects payload when a required top-level field is missing", () => {
    const missingSummary = {
      skills: ["Go"],
      experience: [],
      education: [],
      projects: [],
      technologies: ["Go"],
      certifications: [],
      strengths: ["Concurrency"],
      missingOrUnclear: [],
    };

    const result = ResumeAnalysisSchema.safeParse(missingSummary);
    assert.equal(result.success, false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.includes("candidateSummary"));
      assert.ok(issue, "Expected missing candidateSummary issue");
    }
  });

  it("5. rejects payload with incorrect primitive types", () => {
    const wrongType = {
      candidateSummary: 12345, // should be string
      skills: ["TypeScript"],
      experience: [],
      education: [],
      projects: [],
      technologies: ["TypeScript"],
      certifications: [],
      strengths: [],
      missingOrUnclear: [],
    };

    const result = ResumeAnalysisSchema.safeParse(wrongType);
    assert.equal(result.success, false);
  });

  it("6. rejects experience item with invalid startYear type (string instead of number/null)", () => {
    const invalidExpYear = {
      company: "Company A",
      role: "Engineer",
      startYear: "2020", // string is invalid
      endYear: null,
      description: "Worked on services",
    };

    const result = ExperienceSchema.safeParse(invalidExpYear);
    assert.equal(result.success, false);
  });

  it("7. rejects education item with missing required field", () => {
    const missingField = {
      institution: "Harvard",
      degree: "B.A.",
      // field is missing
      startYear: 2015,
      endYear: 2019,
    };

    const result = EducationSchema.safeParse(missingField);
    assert.equal(result.success, false);
  });

  it("8. rejects project item when technologies is not a string array", () => {
    const invalidProjectTech = {
      name: "Portfolio",
      description: "Personal website",
      technologies: "Next.js", // string instead of string[]
    };

    const result = ProjectSchema.safeParse(invalidProjectTech);
    assert.equal(result.success, false);
  });
});
