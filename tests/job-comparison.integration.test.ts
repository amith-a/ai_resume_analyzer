import { describe, it, before, after, beforeEach, mock } from "node:test";
import assert from "node:assert";
import type { Server } from "node:http";
import { app } from "../src/app.js";
import { jobComparisonPrompt } from "../src/ai/prompts/job-comparison.prompt.js";
import type { JobComparisonOutput } from "../src/ai/schemas/job-comparison.schema.js";
import { SchemaValidationError, UpstreamAIError } from "../src/errors/index.js";

const sampleValidComparison: JobComparisonOutput = {
  matchedSkills: ["TypeScript", "PostgreSQL", "Node.js"],
  missingSkills: ["Kubernetes", "AWS Lambda"],
  relevantExperience: [
    {
      role: "Senior Backend Engineer",
      company: "Acme Corp",
      years: 4,
      relevance: "Directly matches backend requirements using TypeScript and PostgreSQL.",
    },
  ],
  experienceGaps: [
    "Candidate lacks multi-region Kubernetes container orchestration experience in production.",
  ],
  relevantProjects: [
    {
      name: "Distributed Task Queue",
      relevance: "Demonstrates asynchronous system design using Redis and TypeScript.",
    },
  ],
  strengths: ["Strong TypeScript and relational database design background."],
  gaps: ["Missing required Kubernetes experience."],
  improvementSuggestions: [
    "Gain hands-on experience with Kubernetes and container deployment.",
  ],
  overallFit: "moderate",
};

// Valid sample PDF buffer with real text
const samplePdfBuffer = Buffer.from(
  "%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>\nendobj\n4 0 obj\n<< /Length 75 >>\nstream\nBT\n/F1 12 Tf\n100 700 Td\n(Jane Doe - Senior Backend Engineer - TypeScript PostgreSQL) Tj\nET\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000201 00000 n \ntrailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n327\n%%EOF"
);

// Spoofed PNG buffer
const spoofedPngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// Corrupted PDF buffer
const corruptedPdfBuffer = Buffer.from("%PDF-1.4\nCORRUPTED_STREAM_NO_XREF\n%%EOF");

describe("POST /jobs/compare Integration Tests (File Upload + JD)", () => {
  let server: Server;
  let baseUrl: string;
  let capturedResumeText: string | null = null;
  let capturedJobDescription: string | null = null;
  let mockHandler: (input: { resumeText: string; jobDescription: string }) => Promise<JobComparisonOutput>;

  before(async () => {
    mock.method(jobComparisonPrompt, "pipe", () => {
      return {
        invoke: async (input: { resumeText: string; jobDescription: string }) => {
          capturedResumeText = input.resumeText;
          capturedJobDescription = input.jobDescription;
          return mockHandler(input);
        },
      } as any;
    });

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const address = server.address();
        if (address && typeof address === "object") {
          baseUrl = `http://localhost:${address.port}`;
        }
        resolve();
      });
    });
  });

  after(async () => {
    mock.reset();
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  beforeEach(() => {
    capturedResumeText = null;
    capturedJobDescription = null;
    mockHandler = async () => sampleValidComparison;
  });

  it("1. returns 200 OK with structured JobComparisonOutput on valid PDF + jobDescription upload", async () => {
    const formData = new FormData();
    formData.append(
      "file",
      new Blob([samplePdfBuffer], { type: "application/pdf" }),
      "resume.pdf"
    );
    formData.append(
      "jobDescription",
      "Looking for a Senior Backend Engineer with TypeScript and PostgreSQL experience."
    );

    const res = await fetch(`${baseUrl}/jobs/compare`, {
      method: "POST",
      body: formData,
    });

    assert.equal(res.status, 200);
    const json = (await res.json()) as any;
    assert.equal(json.status, "success");
    assert.equal(json.message, "Job description comparison completed successfully");
    assert.deepEqual(json.data, sampleValidComparison);
    assert.equal(json.data.overallFit, "moderate");
  });

  it("2. verifies compareJobDescription receives extracted/normalized resume text and supplied job description", async () => {
    const testJd = "Staff Engineer: Kubernetes and Go required";

    const formData = new FormData();
    formData.append(
      "file",
      new Blob([samplePdfBuffer], { type: "application/pdf" }),
      "resume.pdf"
    );
    formData.append("jobDescription", testJd);

    const res = await fetch(`${baseUrl}/jobs/compare`, {
      method: "POST",
      body: formData,
    });

    assert.equal(res.status, 200);
    assert.ok(capturedResumeText, "Expected extracted resume text to be captured");
    assert.ok(
      capturedResumeText.includes("Jane Doe - Senior Backend Engineer"),
      "Extracted resume text must contain candidate details"
    );
    assert.equal(
      capturedJobDescription,
      testJd,
      "Supplied job description must match exactly"
    );
  });

  it("3. returns appropriate validation error response when resume file is missing", async () => {
    const formData = new FormData();
    formData.append("jobDescription", "Staff Engineer Role Description");

    const res = await fetch(`${baseUrl}/jobs/compare`, {
      method: "POST",
      body: formData,
    });

    assert.equal(res.status, 400);
    const json = (await res.json()) as any;
    assert.equal(json.status, "error");
    assert.equal(json.message, "No resume file provided");
  });

  it("4. returns 400 Bad Request when jobDescription is missing from form body", async () => {
    const formData = new FormData();
    formData.append(
      "file",
      new Blob([samplePdfBuffer], { type: "application/pdf" }),
      "resume.pdf"
    );

    const res = await fetch(`${baseUrl}/jobs/compare`, {
      method: "POST",
      body: formData,
    });

    assert.equal(res.status, 400);
    const json = (await res.json()) as any;
    assert.equal(json.status, "error");
    assert.equal(json.message, "Job description must be a non-empty string");
  });

  it("5. returns 400 Bad Request when jobDescription is empty or whitespace-only", async () => {
    const formData = new FormData();
    formData.append(
      "file",
      new Blob([samplePdfBuffer], { type: "application/pdf" }),
      "resume.pdf"
    );
    formData.append("jobDescription", "   \n\t  ");

    const res = await fetch(`${baseUrl}/jobs/compare`, {
      method: "POST",
      body: formData,
    });

    assert.equal(res.status, 400);
    const json = (await res.json()) as any;
    assert.equal(json.status, "error");
    assert.equal(json.message, "Job description must be a non-empty string");
  });

  it("6. returns 415 Unsupported Media Type for unsupported or spoofed files", async () => {
    const formData = new FormData();
    formData.append(
      "file",
      new Blob([spoofedPngBuffer], { type: "application/pdf" }),
      "fake_resume.pdf"
    );
    formData.append("jobDescription", "Software Engineer Role");

    const res = await fetch(`${baseUrl}/jobs/compare`, {
      method: "POST",
      body: formData,
    });

    assert.equal(res.status, 415);
    const json = (await res.json()) as any;
    assert.equal(json.status, "error");
    assert.ok(json.message.toLowerCase().includes("unsupported"));
  });

  it("7. returns 422 Unprocessable Entity for corrupted or unreadable documents", async () => {
    const formData = new FormData();
    formData.append(
      "file",
      new Blob([corruptedPdfBuffer], { type: "application/pdf" }),
      "corrupted.pdf"
    );
    formData.append("jobDescription", "Software Engineer Role");

    const res = await fetch(`${baseUrl}/jobs/compare`, {
      method: "POST",
      body: formData,
    });

    assert.equal(res.status, 422);
    const json = (await res.json()) as any;
    assert.equal(json.status, "error");
  });

  it("8. returns 502 Bad Gateway when comparison service encounters upstream failure/timeout", async () => {
    mockHandler = async () => {
      throw new UpstreamAIError("Ollama connection refused at 11434");
    };

    const formData = new FormData();
    formData.append(
      "file",
      new Blob([samplePdfBuffer], { type: "application/pdf" }),
      "resume.pdf"
    );
    formData.append("jobDescription", "Software Engineer Role");

    const res = await fetch(`${baseUrl}/jobs/compare`, {
      method: "POST",
      body: formData,
    });

    assert.equal(res.status, 502);
    const json = (await res.json()) as any;
    assert.equal(json.status, "error");
    assert.equal(json.message, "AI service is currently unavailable or timed out");
  });

  it("9. returns 422 Unprocessable Entity when comparison output fails schema validation", async () => {
    mockHandler = async () => {
      return {
        matchedSkills: "TypeScript" as any, // invalid type triggers defensive SchemaValidationError
      } as any;
    };

    const formData = new FormData();
    formData.append(
      "file",
      new Blob([samplePdfBuffer], { type: "application/pdf" }),
      "resume.pdf"
    );
    formData.append("jobDescription", "Software Engineer Role");

    const res = await fetch(`${baseUrl}/jobs/compare`, {
      method: "POST",
      body: formData,
    });

    assert.equal(res.status, 422);
    const json = (await res.json()) as any;
    assert.equal(json.status, "error");
    assert.equal(json.message, "AI output failed schema validation");
    assert.ok(Array.isArray(json.issues));
  });
});
