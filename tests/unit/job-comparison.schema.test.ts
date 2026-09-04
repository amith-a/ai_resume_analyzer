import { describe, it } from "node:test";
import assert from "node:assert";
import {
  JobComparisonInputSchema,
  JobComparisonOutputSchema,
  RelevantExperienceSchema,
  RelevantProjectSchema,
  type JobComparisonInput,
  type JobComparisonOutput,
} from "../../src/ai/schemas/job-comparison.schema.js";

describe("JobComparisonInputSchema Validation", () => {
  it("1. validates a valid input with resumeText and jobDescription", () => {
    const input: JobComparisonInput = {
      resumeText: "Staff Engineer with 10 years of experience in distributed systems.",
      jobDescription: "Looking for a Staff Engineer with Kubernetes and Go experience.",
    };

    const result = JobComparisonInputSchema.safeParse(input);
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.data.resumeText, input.resumeText);
      assert.equal(result.data.jobDescription, input.jobDescription);
    }
  });

  it("2. trims leading and trailing whitespace from input fields", () => {
    const input = {
      resumeText: "   Jane Doe - Cloud Engineer   \n",
      jobDescription: "  \n  Senior DevOps Engineer  \t",
    };

    const result = JobComparisonInputSchema.safeParse(input);
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.data.resumeText, "Jane Doe - Cloud Engineer");
      assert.equal(result.data.jobDescription, "Senior DevOps Engineer");
    }
  });

  it("3. rejects missing resumeText", () => {
    const input = {
      jobDescription: "Software Engineer required.",
    };

    const result = JobComparisonInputSchema.safeParse(input);
    assert.equal(result.success, false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.includes("resumeText"));
      assert.ok(issue, "Expected missing resumeText issue");
    }
  });

  it("4. rejects missing jobDescription", () => {
    const input = {
      resumeText: "Jane Doe Resume Content",
    };

    const result = JobComparisonInputSchema.safeParse(input);
    assert.equal(result.success, false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.includes("jobDescription"));
      assert.ok(issue, "Expected missing jobDescription issue");
    }
  });

  it("5. rejects empty or whitespace-only resumeText", () => {
    const emptyResult = JobComparisonInputSchema.safeParse({
      resumeText: "",
      jobDescription: "Valid Job Description",
    });
    assert.equal(emptyResult.success, false);

    const whitespaceResult = JobComparisonInputSchema.safeParse({
      resumeText: "   \n\t   ",
      jobDescription: "Valid Job Description",
    });
    assert.equal(whitespaceResult.success, false);
  });

  it("6. rejects empty or whitespace-only jobDescription", () => {
    const emptyResult = JobComparisonInputSchema.safeParse({
      resumeText: "Valid Resume Text",
      jobDescription: "",
    });
    assert.equal(emptyResult.success, false);

    const whitespaceResult = JobComparisonInputSchema.safeParse({
      resumeText: "Valid Resume Text",
      jobDescription: "   \n  \t ",
    });
    assert.equal(whitespaceResult.success, false);
  });

  it("7. rejects incorrect field types in input schema", () => {
    const wrongTypeResult = JobComparisonInputSchema.safeParse({
      resumeText: 12345,
      jobDescription: true,
    });
    assert.equal(wrongTypeResult.success, false);
  });
});

describe("JobComparisonOutputSchema Validation", () => {
  const sampleValidOutput: JobComparisonOutput = {
    matchedSkills: ["TypeScript", "Node.js", "Docker", "PostgreSQL"],
    missingSkills: ["Kubernetes", "AWS Lambda"],
    relevantExperience: [
      {
        role: "Staff Backend Engineer",
        company: "Acme Corp",
        years: 4,
        relevance:
          "Directly aligns with the required backend architecture and microservices design experience.",
      },
    ],
    experienceGaps: [
      "Candidate has limited production experience managing multi-region Kubernetes clusters.",
    ],
    relevantProjects: [
      {
        name: "Distributed Task Queue",
        relevance:
          "Demonstrates asynchronous event-driven system design using Redis and TypeScript.",
      },
    ],
    strengths: [
      "Extensive TypeScript and Node.js backend development experience.",
      "Proven track record in high-throughput database optimization.",
    ],
    gaps: ["Missing hands-on experience with serverless cloud architectures."],
    improvementSuggestions: [
      "Highlight any exposure to AWS or container orchestration in project descriptions.",
      "Obtain AWS Solutions Architect Associate or CKA certification to validate cloud skills.",
    ],
    overallFit: "strong",
  };

  it("1. validates a complete and valid JobComparisonOutput object", () => {
    const result = JobComparisonOutputSchema.safeParse(sampleValidOutput);
    assert.equal(result.success, true);
    if (result.success) {
      assert.deepEqual(result.data, sampleValidOutput);
      assert.equal(result.data.overallFit, "strong");
      assert.equal(result.data.matchedSkills.length, 4);
      assert.equal(result.data.relevantExperience.length, 1);
      assert.equal(result.data.relevantProjects.length, 1);
    }
  });

  it("2. accepts optional fields omitted or undefined in relevantExperience", () => {
    const experienceWithoutOptionals = {
      role: "Software Developer",
      relevance: "Built REST APIs matching the backend requirements.",
    };

    const expResult = RelevantExperienceSchema.safeParse(experienceWithoutOptionals);
    assert.equal(expResult.success, true);

    const outputWithMinimalExperience: JobComparisonOutput = {
      ...sampleValidOutput,
      relevantExperience: [experienceWithoutOptionals],
    };

    const result = JobComparisonOutputSchema.safeParse(outputWithMinimalExperience);
    assert.equal(result.success, true);
  });

  it("3. validates all allowed overallFit enum values: 'strong', 'moderate', 'weak'", () => {
    for (const fit of ["strong", "moderate", "weak"] as const) {
      const payload = { ...sampleValidOutput, overallFit: fit };
      const result = JobComparisonOutputSchema.safeParse(payload);
      assert.equal(result.success, true);
      if (result.success) {
        assert.equal(result.data.overallFit, fit);
      }
    }
  });

  it("4. accepts empty arrays for all array fields", () => {
    const minimalOutput: JobComparisonOutput = {
      matchedSkills: [],
      missingSkills: [],
      relevantExperience: [],
      experienceGaps: [],
      relevantProjects: [],
      strengths: [],
      gaps: [],
      improvementSuggestions: [],
      overallFit: "moderate",
    };

    const result = JobComparisonOutputSchema.safeParse(minimalOutput);
    assert.equal(result.success, true);
    if (result.success) {
      assert.deepEqual(result.data.matchedSkills, []);
      assert.deepEqual(result.data.missingSkills, []);
      assert.deepEqual(result.data.relevantExperience, []);
      assert.deepEqual(result.data.relevantProjects, []);
      assert.equal(result.data.overallFit, "moderate");
    }
  });

  it("5. rejects invalid overallFit values", () => {
    const invalidFit = {
      ...sampleValidOutput,
      overallFit: "excellent", // Not in enum ["strong", "moderate", "weak"]
    };

    const result = JobComparisonOutputSchema.safeParse(invalidFit);
    assert.equal(result.success, false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.includes("overallFit"));
      assert.ok(issue, "Expected invalid overallFit enum issue");
    }
  });

  it("6. rejects payload when a required top-level field is missing", () => {
    const missingField = { ...sampleValidOutput };
    // @ts-expect-error delete required property for test
    delete missingField.matchedSkills;

    const result = JobComparisonOutputSchema.safeParse(missingField);
    assert.equal(result.success, false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.includes("matchedSkills"));
      assert.ok(issue, "Expected missing matchedSkills issue");
    }
  });

  it("7. rejects relevantExperience item when required role or relevance is missing", () => {
    const invalidExperienceItem = {
      company: "Acme Corp",
      years: 3,
      // missing role and relevance
    };

    const expResult = RelevantExperienceSchema.safeParse(invalidExperienceItem);
    assert.equal(expResult.success, false);

    const payload = {
      ...sampleValidOutput,
      relevantExperience: [invalidExperienceItem as any],
    };

    const result = JobComparisonOutputSchema.safeParse(payload);
    assert.equal(result.success, false);
  });

  it("8. rejects relevantProjects item when name or relevance is missing or wrong type", () => {
    const invalidProjectItem = {
      name: "Portfolio",
      relevance: 123, // number instead of string
    };

    const projResult = RelevantProjectSchema.safeParse(invalidProjectItem);
    assert.equal(projResult.success, false);

    const payload = {
      ...sampleValidOutput,
      relevantProjects: [invalidProjectItem as any],
    };

    const result = JobComparisonOutputSchema.safeParse(payload);
    assert.equal(result.success, false);
  });

  it("9. rejects incorrect primitive types on string array fields", () => {
    const wrongTypePayload = {
      ...sampleValidOutput,
      matchedSkills: "TypeScript, Node.js", // string instead of string[]
    };

    const result = JobComparisonOutputSchema.safeParse(wrongTypePayload);
    assert.equal(result.success, false);
  });
});
