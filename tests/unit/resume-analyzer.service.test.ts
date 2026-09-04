import { describe, it } from "node:test";
import assert from "node:assert";
import { RunnableLambda } from "@langchain/core/runnables";
import { OutputParserException } from "@langchain/core/output_parsers";
import { analyzeResume, analyzeStoredResume } from "../../src/services/resume-analyzer.service.js";
import {
  UpstreamAIError,
  SchemaValidationError,
  DocumentNotFoundError,
  DocumentExtractionError,
} from "../../src/errors/index.js";
import type { DocumentRecord } from "../../src/types/document.types.js";
import type { ResumeAnalysis } from "../../src/ai/schemas/resume-analysis.schema.js";

const sampleValidAnalysis: ResumeAnalysis = {
  candidateSummary: "Staff Backend Engineer with 10 years experience in distributed systems.",
  skills: ["Distributed Systems", "Cloud Architecture", "API Design"],
  experience: [
    {
      company: "Acme Corp",
      role: "Staff Engineer",
      startYear: 2020,
      endYear: null,
      description: "Designed core microservices processing 100M+ daily events.",
    },
  ],
  education: [
    {
      institution: "Stanford University",
      degree: "B.S.",
      field: "Computer Science",
      startYear: 2010,
      endYear: 2014,
    },
  ],
  projects: [
    {
      name: "High-Throughput Streamer",
      description: "Kafka stream consumer written in Go and Node.js.",
      technologies: ["Node.js", "Kafka", "TypeScript"],
    },
  ],
  technologies: ["TypeScript", "Node.js", "PostgreSQL", "Docker", "Kubernetes"],
  certifications: ["AWS Certified Solutions Architect - Professional"],
  strengths: ["Scalability", "System Reliability", "Mentorship"],
  missingOrUnclear: [],
};

describe("analyzeResume Service", () => {
  it("1. returns a validated ResumeAnalysis object on successful model execution", async () => {
    const mockModel = RunnableLambda.from(async () => {
      return sampleValidAnalysis;
    });

    const result = await analyzeResume("Valid resume content", mockModel);
    assert.deepEqual(result, sampleValidAnalysis);
  });

  it("2. propagates resumeText to the prompt and wraps inside <resume_text> delimiters", async () => {
    let capturedPrompt = "";

    const mockModel = RunnableLambda.from(async (promptValue: any) => {
      capturedPrompt = promptValue.toString();
      return sampleValidAnalysis;
    });

    const testText = "Jane Doe\nSpecialist in Distributed Databases";
    await analyzeResume(testText, mockModel);

    assert.ok(capturedPrompt.includes(testText), "Prompt must contain the dynamic resume text");
    assert.ok(
      capturedPrompt.includes(`<resume_text>\n${testText}\n</resume_text>`),
      "Prompt must enclose resume text within <resume_text> tags",
    );
  });

  it("3. propagates AbortSignal options to the model invocation", async () => {
    let receivedSignal: AbortSignal | undefined;

    const mockModel = RunnableLambda.from(async (_input: any, options: any) => {
      receivedSignal = options?.signal;
      return sampleValidAnalysis;
    });

    await analyzeResume("Some resume text", mockModel);

    assert.ok(receivedSignal instanceof AbortSignal, "Expected valid AbortSignal in call options");
  });

  it("4. rejects empty or whitespace-only input with a validation error", async () => {
    await assert.rejects(async () => analyzeResume(""), /Resume text must be a non-empty string/);

    await assert.rejects(
      async () => analyzeResume("   \n\t  \n  "),
      /Resume text must be a non-empty string/,
    );

    // @ts-expect-error testing defensive check
    await assert.rejects(async () => analyzeResume(null), /Resume text must be a non-empty string/);
  });

  it("5. catches upstream LLM/provider failures and wraps them in UpstreamAIError", async () => {
    const failingModel = RunnableLambda.from(async () => {
      throw new Error("Ollama connection refused at 11434");
    });

    await assert.rejects(
      async () => analyzeResume("Valid resume content", failingModel),
      (err: any) => {
        assert.ok(err instanceof UpstreamAIError, "Must be instance of UpstreamAIError");
        assert.ok(
          err.message.includes("Upstream LLM invocation failed or timed out"),
          "Must have standard safe error message",
        );
        return true;
      },
    );
  });

  it("6. catches timeout errors and wraps them in UpstreamAIError", async () => {
    const timeoutModel = RunnableLambda.from(async () => {
      const timeoutErr = new Error("The operation was aborted due to timeout");
      timeoutErr.name = "TimeoutError";
      throw timeoutErr;
    });

    await assert.rejects(
      async () => analyzeResume("Valid resume content", timeoutModel),
      (err: any) => {
        assert.ok(err instanceof UpstreamAIError, "Must wrap timeout in UpstreamAIError");
        return true;
      },
    );
  });

  it("7. catches model outputs that violate ResumeAnalysisSchema and throws SchemaValidationError", async () => {
    const invalidModel = RunnableLambda.from(async () => {
      // Missing required fields like candidateSummary and skills
      return {
        candidateSummary: 12345, // invalid type
        experience: "not an array",
      };
    });

    await assert.rejects(
      async () => analyzeResume("Valid resume content", invalidModel),
      (err: any) => {
        assert.ok(err instanceof SchemaValidationError, "Must throw SchemaValidationError");
        assert.ok(Array.isArray(err.issues), "Must attach schema validation issues");
        assert.ok(err.issues.length > 0, "Must contain specific field issues");
        return true;
      },
    );
  });

  it("8. catches LangChain OutputParserException and maps to SchemaValidationError", async () => {
    const parserFailingModel = RunnableLambda.from(async () => {
      const parserErr = new OutputParserException('Failed to parse: {"candidateSummary": 12345}');
      (parserErr as any).llmOutput = '{"candidateSummary": 12345}';
      throw parserErr;
    });

    await assert.rejects(
      async () => analyzeResume("Valid resume content", parserFailingModel),
      (err: any) => {
        assert.ok(err instanceof SchemaValidationError, "Must throw SchemaValidationError");
        assert.ok(Array.isArray(err.issues), "Must attach issues array");
        return true;
      },
    );
  });

  it("9. never returns fallback or fabricated data when model fails", async () => {
    const failingModel = RunnableLambda.from(async () => {
      throw new Error("Fatal GPU Out Of Memory");
    });

    let returnedValue = null;
    try {
      returnedValue = await analyzeResume("Valid resume content", failingModel);
    } catch {
      // Expected rejection
    }

    assert.equal(returnedValue, null, "Should not return fallback data on failure");
  });
});

describe("analyzeStoredResume Service", () => {
  const mockDoc: DocumentRecord = {
    id: "doc-123",
    title: "resume.pdf",
    file_path: null,
    document_type: "resume",
    raw_text: "Jane Doe - Lead Engineer with 10 years experience",
    metadata: {},
    created_at: new Date(),
    updated_at: new Date(),
  };

  const mockModel = RunnableLambda.from(async () => sampleValidAnalysis);

  it("1. retrieves stored document and returns structured ResumeAnalysis", async () => {
    let capturedId = "";
    const mockFinder = async (id: string): Promise<DocumentRecord | null> => {
      capturedId = id;
      return mockDoc;
    };

    const result = await analyzeStoredResume("doc-123", {
      modelOverride: mockModel,
      documentFinder: mockFinder,
    });

    assert.equal(capturedId, "doc-123");
    assert.deepEqual(result, sampleValidAnalysis);
  });

  it("2. throws TypeError when documentId is missing, empty, or whitespace", async () => {
    await assert.rejects(
      async () => analyzeStoredResume(""),
      (err: unknown) => {
        assert.ok(err instanceof TypeError);
        assert.ok((err as Error).message.includes("Document ID must be a non-empty string"));
        return true;
      },
    );

    await assert.rejects(
      async () => analyzeStoredResume("   "),
      (err: unknown) => {
        assert.ok(err instanceof TypeError);
        return true;
      },
    );

    await assert.rejects(
      async () => analyzeStoredResume(null as any),
      (err: unknown) => {
        assert.ok(err instanceof TypeError);
        return true;
      },
    );
  });

  it("3. throws DocumentNotFoundError when document does not exist", async () => {
    const mockFinder = async (): Promise<DocumentRecord | null> => null;

    await assert.rejects(
      async () =>
        analyzeStoredResume("non-existent-doc", {
          modelOverride: mockModel,
          documentFinder: mockFinder,
        }),
      (err: unknown) => {
        assert.ok(err instanceof DocumentNotFoundError);
        assert.ok((err as Error).message.includes('Document with ID "non-existent-doc" not found'));
        return true;
      },
    );
  });

  it("4. throws DocumentExtractionError when document has empty or null raw_text", async () => {
    const emptyDoc: DocumentRecord = {
      ...mockDoc,
      raw_text: null,
    };
    const mockFinderNull = async (): Promise<DocumentRecord | null> => emptyDoc;

    await assert.rejects(
      async () =>
        analyzeStoredResume("doc-123", {
          modelOverride: mockModel,
          documentFinder: mockFinderNull,
        }),
      (err: unknown) => {
        assert.ok(err instanceof DocumentExtractionError);
        assert.ok((err as Error).message.includes("has no extracted text to analyze"));
        return true;
      },
    );

    const whitespaceDoc: DocumentRecord = {
      ...mockDoc,
      raw_text: "   ",
    };
    const mockFinderWhitespace = async (): Promise<DocumentRecord | null> => whitespaceDoc;

    await assert.rejects(
      async () =>
        analyzeStoredResume("doc-123", {
          modelOverride: mockModel,
          documentFinder: mockFinderWhitespace,
        }),
      (err: unknown) => {
        assert.ok(err instanceof DocumentExtractionError);
        return true;
      },
    );
  });

  it("5. propagates schema validation and upstream AI errors correctly", async () => {
    const failingModel = RunnableLambda.from(async () => {
      throw new UpstreamAIError("Ollama failed");
    });
    const mockFinder = async (): Promise<DocumentRecord | null> => mockDoc;

    await assert.rejects(
      async () =>
        analyzeStoredResume("doc-123", {
          modelOverride: failingModel,
          documentFinder: mockFinder,
        }),
      (err: unknown) => {
        assert.ok(err instanceof UpstreamAIError);
        return true;
      },
    );
  });
});
