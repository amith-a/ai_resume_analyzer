import { describe, it } from "node:test";
import assert from "node:assert";
import { resumeAnalysisPrompt } from "../src/ai/prompts/resume-analysis.prompt.js";

describe("resumeAnalysisPrompt", () => {
  it("1. formats into system and human message roles", async () => {
    const messages = await resumeAnalysisPrompt.formatMessages({
      resumeText: "Jane Doe\nSoftware Engineer",
    });

    assert.equal(messages.length, 2);
    assert.equal(messages[0].type, "system");
    assert.equal(messages[1].type, "human");
  });

  it("2. inserts dynamic resumeText into the human message", async () => {
    const testResume = "Alex Smith\nDevOps Engineer\nSkills: Kubernetes, Terraform";
    const messages = await resumeAnalysisPrompt.formatMessages({
      resumeText: testResume,
    });

    const humanContent = typeof messages[1].content === "string" ? messages[1].content : "";
    assert.ok(
      humanContent.includes(testResume),
      "Human message must contain the dynamic resume text",
    );
  });

  it("3. wraps input in explicit <resume_text> XML delimiters", async () => {
    const testResume = "John Doe Resume Content";
    const messages = await resumeAnalysisPrompt.formatMessages({
      resumeText: testResume,
    });

    const humanContent = typeof messages[1].content === "string" ? messages[1].content : "";
    assert.ok(
      humanContent.includes(`<resume_text>\n${testResume}\n</resume_text>`),
      "Resume text must be enclosed within <resume_text> tags",
    );
  });

  it("4. system prompt enforces fact grounding and prevents fabricated information", async () => {
    const messages = await resumeAnalysisPrompt.formatMessages({
      resumeText: "Sample",
    });

    const systemContent = typeof messages[0].content === "string" ? messages[0].content : "";
    assert.ok(systemContent.includes("Fact Grounding"), "Must include Fact Grounding rule");
    assert.ok(systemContent.includes("No Fabrication"), "Must include No Fabrication rule");
    assert.ok(
      systemContent.toLowerCase().includes("never invent"),
      "Must explicitly forbid inventing data",
    );
  });

  it("5. system prompt instructs null for unknown years and empty arrays for missing sections", async () => {
    const messages = await resumeAnalysisPrompt.formatMessages({
      resumeText: "Sample",
    });

    const systemContent = typeof messages[0].content === "string" ? messages[0].content : "";
    assert.ok(systemContent.includes("startYear"), "Must reference startYear");
    assert.ok(systemContent.includes("endYear"), "Must reference endYear");
    assert.ok(systemContent.includes("null"), "Must instruct using null for missing years");
    assert.ok(
      systemContent.includes("empty list []"),
      "Must instruct using [] for missing sections",
    );
  });

  it("6. system prompt addresses prompt injection defenses", async () => {
    const messages = await resumeAnalysisPrompt.formatMessages({
      resumeText: "Sample",
    });

    const systemContent = typeof messages[0].content === "string" ? messages[0].content : "";
    assert.ok(systemContent.includes("Security & Safety"), "Must contain security rules");
    assert.ok(systemContent.includes("passive data"), "Must state that text is passive data");
  });

  it("7. prompt generation is deterministic", async () => {
    const input = { resumeText: "Deterministic Input Content" };
    const messages1 = await resumeAnalysisPrompt.formatMessages(input);
    const messages2 = await resumeAnalysisPrompt.formatMessages(input);

    assert.equal(messages1[0].content, messages2[0].content);
    assert.equal(messages1[1].content, messages2[1].content);
  });
});
