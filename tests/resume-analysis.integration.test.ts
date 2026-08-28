import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert";
import type { Server } from "node:http";
import { app } from "../src/app.js";
import {
  setAnalyzeResumeHandler,
  resetAnalyzeResumeHandler,
} from "../src/services/resume-analyzer.service.js";
import { UpstreamAIError, SchemaValidationError } from "../src/errors/index.js";
import type { ResumeAnalysis } from "../src/ai/schemas/resume-analysis.schema.js";

const mockValidAnalysis: ResumeAnalysis = {
  candidateSummary: "Lead Engineer with 10 years experience in distributed systems.",
  skills: ["Distributed Systems", "Cloud Architecture"],
  experience: [
    {
      company: "Acme Corp",
      role: "Lead Engineer",
      startYear: 2020,
      endYear: null,
      description: "Led scalable microservices architecture.",
    },
  ],
  education: [
    {
      institution: "MIT",
      degree: "B.S.",
      field: "Computer Science",
      startYear: 2010,
      endYear: 2014,
    },
  ],
  projects: [
    {
      name: "Distributed Cache",
      description: "In-memory cache built with Node.js.",
      technologies: ["Node.js", "TypeScript"],
    },
  ],
  technologies: ["Node.js", "TypeScript", "Docker"],
  certifications: ["AWS Certified Solutions Architect"],
  strengths: ["Architecture", "System Design"],
  missingOrUnclear: [],
};

// Valid sample PDF buffer
const samplePdfBuffer = Buffer.from(
  "%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>\nendobj\n4 0 obj\n<< /Length 55 >>\nstream\nBT\n/F1 12 Tf\n100 700 Td\n(Jane Doe - Lead Engineer) Tj\nET\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000201 00000 n \ntrailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n307\n%%EOF"
);

// Corrupted PDF buffer (has PDF magic header but corrupt stream/xref)
const corruptedPdfBuffer = Buffer.from("%PDF-1.4\nCORRUPTED_BINARY_STREAM_NO_XREF\n%%EOF");

// Spoofed PNG buffer
const spoofedPngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe("POST /resumes/analyze Integration Tests (LLM Isolated)", () => {
  let server: Server;
  let baseUrl: string;
  let stubHandler: (text: string) => Promise<ResumeAnalysis>;
  let capturedNormalizedText: string | null = null;

  before(async () => {
    setAnalyzeResumeHandler(async (text: string) => {
      capturedNormalizedText = text;
      return stubHandler(text);
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
    resetAnalyzeResumeHandler();
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  beforeEach(() => {
    capturedNormalizedText = null;
    stubHandler = async () => mockValidAnalysis;
  });

  it("1. returns 200 OK with structured ResumeAnalysis on valid resume upload", async () => {
    const formData = new FormData();
    formData.append("file", new Blob([samplePdfBuffer], { type: "application/pdf" }), "resume.pdf");

    const res = await fetch(`${baseUrl}/resumes/analyze`, {
      method: "POST",
      body: formData,
    });

    assert.equal(res.status, 200);
    const json = (await res.json()) as any;
    assert.equal(json.status, "success");
    assert.deepEqual(json.data, mockValidAnalysis);
  });

  it("2. passes normalized resume text (not raw unnormalized text) to analyzeResume()", async () => {
    const formData = new FormData();
    formData.append("file", new Blob([samplePdfBuffer], { type: "application/pdf" }), "resume.pdf");

    const res = await fetch(`${baseUrl}/resumes/analyze`, {
      method: "POST",
      body: formData,
    });

    assert.equal(res.status, 200);
    assert.ok(capturedNormalizedText !== null, "analyzeResume must receive normalized text");
    assert.ok(capturedNormalizedText.includes("Jane Doe - Lead Engineer"));
    // Ensure normalization removed extra edge whitespace/newlines
    assert.equal(capturedNormalizedText.trim(), capturedNormalizedText);
  });

  it("3. returns 400 Bad Request when no file is uploaded", async () => {
    const res = await fetch(`${baseUrl}/resumes/analyze`, {
      method: "POST",
    });

    assert.equal(res.status, 400);
    const json = (await res.json()) as any;
    assert.equal(json.status, "error");
    assert.equal(json.message, "No resume file provided");
  });

  it("4. returns 415 Unsupported Media Type for unsupported or spoofed files", async () => {
    const formData = new FormData();
    formData.append("file", new Blob([spoofedPngBuffer], { type: "application/pdf" }), "fake.pdf");

    const res = await fetch(`${baseUrl}/resumes/analyze`, {
      method: "POST",
      body: formData,
    });

    assert.equal(res.status, 415);
    const json = (await res.json()) as any;
    assert.equal(json.status, "error");
    assert.ok(
      json.message.toLowerCase().includes("unsupported"),
      "Message must mention unsupported type"
    );
  });

  it("5. returns 422 Unprocessable Entity for corrupted or unreadable documents", async () => {
    const formData = new FormData();
    formData.append("file", new Blob([corruptedPdfBuffer], { type: "application/pdf" }), "corrupt.pdf");

    const res = await fetch(`${baseUrl}/resumes/analyze`, {
      method: "POST",
      body: formData,
    });

    assert.equal(res.status, 422);
    const json = (await res.json()) as any;
    assert.equal(json.status, "error");
    assert.ok(json.message.includes("Failed to extract text"));
  });

  it("6. returns 502 Bad Gateway when AI service encounters upstream failure/timeout", async () => {
    stubHandler = async () => {
      throw new UpstreamAIError("Upstream LLM invocation failed or timed out");
    };

    const formData = new FormData();
    formData.append("file", new Blob([samplePdfBuffer], { type: "application/pdf" }), "resume.pdf");

    const res = await fetch(`${baseUrl}/resumes/analyze`, {
      method: "POST",
      body: formData,
    });

    assert.equal(res.status, 502);
    const json = (await res.json()) as any;
    assert.equal(json.status, "error");
    assert.equal(json.message, "AI service is currently unavailable or timed out");
  });

  it("7. returns 422 Unprocessable Entity when LLM output violates schema validation", async () => {
    stubHandler = async () => {
      throw new SchemaValidationError("Model output failed defensive schema validation", [
        // @ts-expect-error - mock issue
        { path: ["candidateSummary"], message: "Expected string, received number" },
      ]);
    };

    const formData = new FormData();
    formData.append("file", new Blob([samplePdfBuffer], { type: "application/pdf" }), "resume.pdf");

    const res = await fetch(`${baseUrl}/resumes/analyze`, {
      method: "POST",
      body: formData,
    });

    assert.equal(res.status, 422);
    const json = (await res.json()) as any;
    assert.equal(json.status, "error");
    assert.equal(json.message, "AI output failed schema validation");
    assert.ok(Array.isArray(json.issues));
  });

  it("8. never returns fallback or fabricated analysis data on failure", async () => {
    stubHandler = async () => {
      throw new UpstreamAIError("Fatal crash");
    };

    const formData = new FormData();
    formData.append("file", new Blob([samplePdfBuffer], { type: "application/pdf" }), "resume.pdf");

    const res = await fetch(`${baseUrl}/resumes/analyze`, {
      method: "POST",
      body: formData,
    });

    const json = (await res.json()) as any;
    assert.equal(json.data, undefined, "Response must not contain data object on failure");
  });
});
