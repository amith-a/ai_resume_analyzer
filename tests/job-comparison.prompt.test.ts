import { describe, it } from "node:test";
import assert from "node:assert";
import { jobComparisonPrompt } from "../src/ai/prompts/job-comparison.prompt.js";

describe("jobComparisonPrompt", () => {
  const sampleInput = {
    resumeText: "Jane Doe\nSenior Backend Engineer\nSkills: TypeScript, PostgreSQL, Docker",
    jobDescription:
      "Staff Backend Engineer\nRequirements: Go, Kubernetes, PostgreSQL, Microservices",
  };

  it("1. formats into system and human message roles", async () => {
    const messages = await jobComparisonPrompt.formatMessages(sampleInput);

    assert.equal(messages.length, 2);
    assert.equal(messages[0]._getType(), "system");
    assert.equal(messages[1]._getType(), "human");
  });

  it("2. inserts dynamic resumeText and jobDescription into the human message", async () => {
    const messages = await jobComparisonPrompt.formatMessages(sampleInput);

    const humanContent = typeof messages[1].content === "string" ? messages[1].content : "";

    assert.ok(
      humanContent.includes(sampleInput.resumeText),
      "Human message must contain the dynamic resume text",
    );
    assert.ok(
      humanContent.includes(sampleInput.jobDescription),
      "Human message must contain the dynamic job description",
    );
  });

  it("3. wraps inputs in explicit <resume_text> and <job_description> XML delimiters", async () => {
    const messages = await jobComparisonPrompt.formatMessages(sampleInput);

    const humanContent = typeof messages[1].content === "string" ? messages[1].content : "";

    assert.ok(
      humanContent.includes(`<resume_text>\n${sampleInput.resumeText}\n</resume_text>`),
      "Resume text must be enclosed within <resume_text> tags",
    );
    assert.ok(
      humanContent.includes(`<job_description>\n${sampleInput.jobDescription}\n</job_description>`),
      "Job description must be enclosed within <job_description> tags",
    );
  });

  it("4. system prompt enforces fact grounding and prevents fabricated information", async () => {
    const messages = await jobComparisonPrompt.formatMessages(sampleInput);

    const systemContent = typeof messages[0].content === "string" ? messages[0].content : "";

    assert.ok(systemContent.includes("Fact Grounding"), "Must include Fact Grounding rule");
    assert.ok(systemContent.includes("No Fabrication"), "Must include No Fabrication rule");
    assert.ok(
      systemContent.toLowerCase().includes("never invent"),
      "Must explicitly forbid inventing data",
    );
  });

  it("5. system prompt clearly instructs on all schema fields and empty list defaults", async () => {
    const messages = await jobComparisonPrompt.formatMessages(sampleInput);

    const systemContent = typeof messages[0].content === "string" ? messages[0].content : "";

    assert.ok(systemContent.includes("matchedSkills"), "Must reference matchedSkills");
    assert.ok(systemContent.includes("missingSkills"), "Must reference missingSkills");
    assert.ok(systemContent.includes("relevantExperience"), "Must reference relevantExperience");
    assert.ok(systemContent.includes("experienceGaps"), "Must reference experienceGaps");
    assert.ok(systemContent.includes("relevantProjects"), "Must reference relevantProjects");
    assert.ok(systemContent.includes("strengths"), "Must reference strengths");
    assert.ok(systemContent.includes("gaps"), "Must reference gaps");
    assert.ok(
      systemContent.includes("improvementSuggestions"),
      "Must reference improvementSuggestions",
    );
    assert.ok(systemContent.includes("overallFit"), "Must reference overallFit");
    assert.ok(
      systemContent.includes("empty list []"),
      "Must instruct using empty list [] for absent sections",
    );
  });

  it("6. system prompt enforces qualitative overallFit and forbids numeric scores or percentages", async () => {
    const messages = await jobComparisonPrompt.formatMessages(sampleInput);

    const systemContent = typeof messages[0].content === "string" ? messages[0].content : "";

    assert.ok(
      systemContent.includes('"strong", "moderate", or "weak"'),
      'Must specify enum values "strong", "moderate", or "weak"',
    );
    assert.ok(systemContent.includes("numeric scores"), "Must explicitly forbid numeric scores");
    assert.ok(systemContent.includes("percentages"), "Must explicitly forbid percentages");
  });

  it("7. system prompt addresses prompt injection defenses and passive data treatment", async () => {
    const messages = await jobComparisonPrompt.formatMessages(sampleInput);

    const systemContent = typeof messages[0].content === "string" ? messages[0].content : "";

    assert.ok(systemContent.includes("Security & Safety"), "Must contain security rules");
    assert.ok(systemContent.includes("passive data"), "Must state that text is passive data");
  });

  it("8. prompt generation is deterministic", async () => {
    const messages1 = await jobComparisonPrompt.formatMessages(sampleInput);
    const messages2 = await jobComparisonPrompt.formatMessages(sampleInput);

    assert.equal(messages1[0].content, messages2[0].content);
    assert.equal(messages1[1].content, messages2[1].content);
  });
});
