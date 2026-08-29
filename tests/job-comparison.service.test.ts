import { describe, it } from "node:test";
import assert from "node:assert";
import { RunnableLambda } from "@langchain/core/runnables";
import { compareJobDescription } from "../src/services/job-comparison.service.js";
import { JobComparisonOutput } from "../src/ai/schemas/job-comparison.schema.js";
import { SchemaValidationError, UpstreamAIError } from "../src/errors/index.js";

describe("compareJobDescription Service", () => {
  const sampleResume = "Jane Doe\nSenior Backend Engineer\nSkills: TypeScript, Node.js, PostgreSQL";
  const sampleJobDescription = "Staff Backend Engineer\nRequirements: TypeScript, PostgreSQL, Kubernetes";

  const sampleValidComparison: JobComparisonOutput = {
    matchedSkills: ["TypeScript", "PostgreSQL"],
    missingSkills: ["Kubernetes"],
    relevantExperience: [
      {
        role: "Senior Backend Engineer",
        relevance: "Directly matches backend requirements using TypeScript and PostgreSQL.",
      },
    ],
    experienceGaps: [
      "Candidate lacks Kubernetes container orchestration experience in production.",
    ],
    relevantProjects: [],
    strengths: ["Strong TypeScript and relational database design background."],
    gaps: ["Missing required Kubernetes experience."],
    improvementSuggestions: [
      "Gain hands-on experience with Kubernetes and container deployment.",
    ],
    overallFit: "moderate",
  };

  it("1. returns a validated JobComparisonOutput on successful model execution", async () => {
    const mockModel = RunnableLambda.from(async () => sampleValidComparison);

    const result = await compareJobDescription(
      sampleResume,
      sampleJobDescription,
      mockModel
    );

    assert.equal(result.overallFit, "moderate");
    assert.deepEqual(result.matchedSkills, ["TypeScript", "PostgreSQL"]);
    assert.deepEqual(result.missingSkills, ["Kubernetes"]);
    assert.equal(result.relevantExperience.length, 1);
    assert.equal(result.strengths.length, 1);
  });

  it("2. propagates inputs to the prompt wrapped inside XML delimiters", async () => {
    let capturedInput: any = null;

    const mockModel = RunnableLambda.from(async (input: any) => {
      capturedInput = input;
      return sampleValidComparison;
    });

    await compareJobDescription(sampleResume, sampleJobDescription, mockModel);

    assert.ok(capturedInput, "Expected model to receive formatted prompt");
    const humanMsg = capturedInput.messages?.find((m: any) => m._getType() === "human");
    assert.ok(humanMsg, "Expected human message in prompt");
    const humanContent = typeof humanMsg.content === "string" ? humanMsg.content : "";

    assert.ok(
      humanContent.includes(`<resume_text>\n${sampleResume}\n</resume_text>`),
      "Resume text must be wrapped inside <resume_text> tag"
    );
    assert.ok(
      humanContent.includes(
        `<job_description>\n${sampleJobDescription}\n</job_description>`
      ),
      "Job description must be wrapped inside <job_description> tag"
    );
  });

  it("3. rejects empty, missing, or whitespace-only resume text", async () => {
    await assert.rejects(
      async () => compareJobDescription("", sampleJobDescription),
      /Resume text and job description must be non-empty strings/
    );

    await assert.rejects(
      async () => compareJobDescription("   \n\t  ", sampleJobDescription),
      /Resume text and job description must be non-empty strings/
    );

    // @ts-expect-error testing runtime validation
    await assert.rejects(async () => compareJobDescription(null, sampleJobDescription), TypeError);
  });

  it("4. rejects empty, missing, or whitespace-only job description", async () => {
    await assert.rejects(
      async () => compareJobDescription(sampleResume, ""),
      /Resume text and job description must be non-empty strings/
    );

    await assert.rejects(
      async () => compareJobDescription(sampleResume, "   \n\t  "),
      /Resume text and job description must be non-empty strings/
    );

    // @ts-expect-error testing runtime validation
    await assert.rejects(async () => compareJobDescription(sampleResume, undefined), TypeError);
  });

  it("5. catches upstream LLM/provider failures and wraps them in UpstreamAIError", async () => {
    const failingModel = RunnableLambda.from(async () => {
      throw new Error("Ollama connection refused at 11434");
    });

    await assert.rejects(
      async () => compareJobDescription(sampleResume, sampleJobDescription, failingModel),
      (err: any) => {
        assert.ok(err instanceof UpstreamAIError, "Must be instance of UpstreamAIError");
        assert.ok(
          err.message.includes("Upstream LLM invocation failed or timed out"),
          "Must have standard safe error message"
        );
        return true;
      }
    );
  });

  it("6. catches timeout errors and wraps them in UpstreamAIError", async () => {
    const timeoutModel = RunnableLambda.from(async () => {
      const err = new Error("The operation was aborted due to timeout");
      err.name = "TimeoutError";
      throw err;
    });

    await assert.rejects(
      async () => compareJobDescription(sampleResume, sampleJobDescription, timeoutModel),
      (err: any) => {
        assert.ok(err instanceof UpstreamAIError, "Must wrap TimeoutError in UpstreamAIError");
        return true;
      }
    );
  });

  it("7. rejects invalid structured output through defensive schema validation", async () => {
    const invalidOutputModel = RunnableLambda.from(async () => {
      return {
        matchedSkills: "TypeScript", // invalid primitive type (string instead of string[])
        overallFit: "exceptional", // invalid enum
      };
    });

    await assert.rejects(
      async () => compareJobDescription(sampleResume, sampleJobDescription, invalidOutputModel),
      (err: any) => {
        assert.ok(err instanceof SchemaValidationError, "Must throw SchemaValidationError");
        assert.ok(Array.isArray(err.issues), "Must attach schema validation issues");
        assert.ok(err.issues.length > 0, "Must contain specific field validation issues");
        return true;
      }
    );
  });

  it("8. accepts a valid comparison with empty arrays", async () => {
    const emptyArraysComparison: JobComparisonOutput = {
      matchedSkills: [],
      missingSkills: [],
      relevantExperience: [],
      experienceGaps: [],
      relevantProjects: [],
      strengths: [],
      gaps: [],
      improvementSuggestions: [],
      overallFit: "weak",
    };

    const mockModel = RunnableLambda.from(async () => emptyArraysComparison);

    const result = await compareJobDescription(
      sampleResume,
      sampleJobDescription,
      mockModel
    );

    assert.equal(result.overallFit, "weak");
    assert.deepEqual(result.matchedSkills, []);
    assert.deepEqual(result.relevantExperience, []);
  });

  it("9. never returns fallback or fabricated comparison data on model failure", async () => {
    const failingModel = RunnableLambda.from(async () => {
      throw new Error("Fatal server error");
    });

    let returnedValue = null;
    try {
      returnedValue = await compareJobDescription(
        sampleResume,
        sampleJobDescription,
        failingModel
      );
    } catch {
      // expected error
    }

    assert.equal(returnedValue, null, "Must never return fallback data");
  });
});
