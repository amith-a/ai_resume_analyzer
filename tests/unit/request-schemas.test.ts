import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { AnalyzeResumeRequestSchema } from "../../src/schemas/analyze-resume-request.schema.js";
import {
  AskResumeParamsSchema,
  AskResumeBodySchema,
} from "../../src/schemas/ask-resume-request.schema.js";
import { JobComparisonRequestSchema } from "../../src/schemas/job-comparison-request.schema.js";
import { RetrieveChunksRequestSchema } from "../../src/schemas/retrieval-request.schema.js";

describe("API Request Schemas Unit Tests (Phase 16)", () => {
  describe("AnalyzeResumeRequestSchema", () => {
    it("accepts valid documentId", () => {
      const parsed = AnalyzeResumeRequestSchema.parse({
        documentId: "550e8400-e29b-41d4-a716-446655440000",
      });
      assert.equal(parsed.documentId, "550e8400-e29b-41d4-a716-446655440000");
    });

    it("rejects empty or whitespace-only documentId", () => {
      assert.throws(() => AnalyzeResumeRequestSchema.parse({ documentId: "   " }));
      assert.throws(() => AnalyzeResumeRequestSchema.parse({ documentId: "" }));
      assert.throws(() => AnalyzeResumeRequestSchema.parse({}));
    });
  });

  describe("AskResume schemas", () => {
    it("validates AskResumeParamsSchema", () => {
      assert.equal(AskResumeParamsSchema.parse({ id: "doc-1" }).id, "doc-1");
      assert.throws(() => AskResumeParamsSchema.parse({ id: "" }));
      assert.throws(() => AskResumeParamsSchema.parse({}));
    });

    it("validates AskResumeBodySchema", () => {
      const valid = AskResumeBodySchema.parse({
        query: "What is the candidate's background?",
        topK: 3,
        maxDistanceThreshold: 0.4,
        metadataFilter: { section: "experience" },
      });
      assert.equal(valid.query, "What is the candidate's background?");
      assert.equal(valid.topK, 3);
      assert.equal(valid.maxDistanceThreshold, 0.4);

      assert.throws(() => AskResumeBodySchema.parse({ query: "" }));
      assert.throws(() => AskResumeBodySchema.parse({ query: "valid", topK: -1 }));
      assert.throws(() => AskResumeBodySchema.parse({ query: "valid", topK: 2.5 }));
      assert.throws(() =>
        AskResumeBodySchema.parse({ query: "valid", maxDistanceThreshold: -0.1 }),
      );
      assert.throws(() =>
        AskResumeBodySchema.parse({ query: "valid", metadataFilter: ["not", "an", "object"] }),
      );
    });
  });

  describe("JobComparisonRequestSchema", () => {
    it("accepts valid comparison payload", () => {
      const res = JobComparisonRequestSchema.parse({
        documentId: "doc-123",
        jobDescription:
          "Senior TypeScript Engineer with 5+ years experience building cloud services.",
      });
      assert.equal(res.documentId, "doc-123");
      assert.ok(res.jobDescription.startsWith("Senior TypeScript"));
    });

    it("rejects missing or empty fields", () => {
      assert.throws(() =>
        JobComparisonRequestSchema.parse({ documentId: "doc-123", jobDescription: "" }),
      );
      assert.throws(() =>
        JobComparisonRequestSchema.parse({ documentId: "", jobDescription: "Valid desc" }),
      );
      assert.throws(() => JobComparisonRequestSchema.parse({}));
    });

    it("rejects job description exceeding 50,000 characters", () => {
      const oversized = "a".repeat(50001);
      assert.throws(() =>
        JobComparisonRequestSchema.parse({ documentId: "doc-1", jobDescription: oversized }),
      );
    });
  });

  describe("RetrieveChunksRequestSchema", () => {
    it("accepts valid retrieve chunks request", () => {
      const res = RetrieveChunksRequestSchema.parse({
        query: "distributed systems",
        documentId: "doc-abc",
        topK: 5,
        maxDistanceThreshold: 0.5,
      });
      assert.equal(res.query, "distributed systems");
      assert.equal(res.documentId, "doc-abc");
    });

    it("rejects missing documentId or query", () => {
      assert.throws(() => RetrieveChunksRequestSchema.parse({ query: "search" }));
      assert.throws(() => RetrieveChunksRequestSchema.parse({ documentId: "doc-1" }));
      assert.throws(() => RetrieveChunksRequestSchema.parse({ query: "", documentId: "doc-1" }));
    });
  });
});
