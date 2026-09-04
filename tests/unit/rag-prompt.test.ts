import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ragPrompt } from "../../src/ai/prompts/rag.prompt.js";

describe("ragPrompt Unit Tests (Phase 12 — Block 4 & Block 5)", () => {
  it("1. formats into system and human message roles", async () => {
    const messages = await ragPrompt.formatMessages({
      context: "[Source 1]\nSenior Engineer with TypeScript experience.",
      query: "What is the candidate's primary skill?",
    });

    assert.equal(messages.length, 2);
    assert.equal(messages[0].type, "system");
    assert.equal(messages[1].type, "human");
  });

  it("2. inserts dynamic context and query into the human message", async () => {
    const testContext = "[Source 1]\nAWS Certified Solutions Architect with 5 years experience.";
    const testQuery = "What certifications does the candidate hold?";

    const messages = await ragPrompt.formatMessages({
      context: testContext,
      query: testQuery,
    });

    const humanContent = typeof messages[1].content === "string" ? messages[1].content : "";
    assert.ok(humanContent.includes(testContext), "Human message must contain the context");
    assert.ok(humanContent.includes(testQuery), "Human message must contain the query");
    assert.ok(humanContent.includes("Final Answer (no reasoning):"));
  });

  it("3. wraps context in explicit <resume_context> XML delimiters", async () => {
    const testContext = "[Source 1]\nPostgreSQL database optimization.";
    const messages = await ragPrompt.formatMessages({
      context: testContext,
      query: "Explain database experience",
    });

    const humanContent = typeof messages[1].content === "string" ? messages[1].content : "";
    assert.ok(
      humanContent.includes(`<resume_context>\n${testContext}\n</resume_context>`),
      "Context must be enclosed within <resume_context> tags",
    );
  });

  it("4. system prompt enforces grounding and anti-fabrication rules", async () => {
    const messages = await ragPrompt.formatMessages({
      context: "Sample context",
      query: "Sample query",
    });

    const systemContent = typeof messages[0].content === "string" ? messages[0].content : "";
    assert.ok(systemContent.includes("Rely strictly on explicit facts"));
    assert.ok(
      systemContent.includes("The information is not available in the provided resume context"),
    );
  });

  it("5. system prompt explicitly prohibits reasoning, walkthroughs, and meta-commentary", async () => {
    const messages = await ragPrompt.formatMessages({
      context: "Sample context",
      query: "Sample query",
    });

    const systemContent = typeof messages[0].content === "string" ? messages[0].content : "";
    assert.ok(systemContent.includes("Final Answer Only"));
    assert.ok(systemContent.includes("No Reasoning or Analysis"));
    assert.ok(systemContent.includes("source-by-source walkthroughs"));
  });

  it("6. system prompt addresses prompt injection defenses", async () => {
    const messages = await ragPrompt.formatMessages({
      context: "Sample context",
      query: "Sample query",
    });

    const systemContent = typeof messages[0].content === "string" ? messages[0].content : "";
    assert.ok(systemContent.includes("passive data"));
  });

  it("7. prompt generation is deterministic", async () => {
    const input = {
      context: "[Source 1]\nDeterministic test content.",
      query: "What is the content?",
    };

    const messages1 = await ragPrompt.formatMessages(input);
    const messages2 = await ragPrompt.formatMessages(input);

    assert.equal(messages1[0].content, messages2[0].content);
    assert.equal(messages1[1].content, messages2[1].content);
  });
});
