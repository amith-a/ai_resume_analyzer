import { describe, it } from "node:test";
import assert from "node:assert";
import { RunnableLambda } from "@langchain/core/runnables";
import { OutputParserException } from "@langchain/core/output_parsers";
import {
  compareJobDescription,
  compareStoredJob,
} from "../../src/services/job-comparison.service.js";
import { JobComparisonOutput } from "../../src/ai/schemas/job-comparison.schema.js";
import {
  SchemaValidationError,
  UpstreamAIError,
  DocumentNotFoundError,
  DocumentExtractionError,
} from "../../src/errors/index.js";
import type {
  DocumentRecord,
  DocumentChunkWithDistanceRecord,
} from "../../src/types/document.types.js";
import type { RagRetrievalParams } from "../../src/services/rag-retrieval.service.js";

interface PromptTestMessage {
  _getType(): string;
  content: string | unknown;
}

interface PromptTestInput {
  messages?: PromptTestMessage[];
}

describe("compareJobDescription Service", () => {
  const sampleResume = "Jane Doe\nSenior Backend Engineer\nSkills: TypeScript, Node.js, PostgreSQL";
  const sampleJobDescription =
    "Staff Backend Engineer\nRequirements: TypeScript, PostgreSQL, Kubernetes";

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
    improvementSuggestions: ["Gain hands-on experience with Kubernetes and container deployment."],
    overallFit: "moderate",
  };

  it("1. returns a validated JobComparisonOutput on successful model execution", async () => {
    const mockModel = RunnableLambda.from(async () => sampleValidComparison);

    const result = await compareJobDescription(sampleResume, sampleJobDescription, mockModel);

    assert.equal(result.overallFit, "moderate");
    assert.deepEqual(result.matchedSkills, ["TypeScript", "PostgreSQL"]);
    assert.deepEqual(result.missingSkills, ["Kubernetes"]);
    assert.equal(result.relevantExperience.length, 1);
    assert.equal(result.strengths.length, 1);
  });

  it("2. propagates inputs to the prompt wrapped inside XML delimiters", async () => {
    let capturedInput: PromptTestInput | null = null;

    const mockModel = RunnableLambda.from(async (input: unknown) => {
      capturedInput = input as PromptTestInput;
      return sampleValidComparison;
    });

    await compareJobDescription(sampleResume, sampleJobDescription, mockModel);

    assert.ok(capturedInput, "Expected model to receive formatted prompt");
    const humanMsg = (capturedInput as PromptTestInput).messages?.find(
      (m) => m._getType() === "human",
    );
    assert.ok(humanMsg, "Expected human message in prompt");
    const humanContent = typeof humanMsg.content === "string" ? humanMsg.content : "";

    assert.ok(
      humanContent.includes(`<resume_text>\n${sampleResume}\n</resume_text>`),
      "Resume text must be wrapped inside <resume_text> tag",
    );
    assert.ok(
      humanContent.includes(`<job_description>\n${sampleJobDescription}\n</job_description>`),
      "Job description must be wrapped inside <job_description> tag",
    );
  });

  it("3. rejects empty, missing, or whitespace-only resume text", async () => {
    await assert.rejects(
      async () => compareJobDescription("", sampleJobDescription),
      /Resume text and job description must be non-empty strings/,
    );

    await assert.rejects(
      async () => compareJobDescription("   \n\t  ", sampleJobDescription),
      /Resume text and job description must be non-empty strings/,
    );

    // @ts-expect-error testing runtime validation
    await assert.rejects(async () => compareJobDescription(null, sampleJobDescription), TypeError);
  });

  it("4. rejects empty, missing, or whitespace-only job description", async () => {
    await assert.rejects(
      async () => compareJobDescription(sampleResume, ""),
      /Resume text and job description must be non-empty strings/,
    );

    await assert.rejects(
      async () => compareJobDescription(sampleResume, "   \n\t  "),
      /Resume text and job description must be non-empty strings/,
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
          "Must have standard safe error message",
        );
        return true;
      },
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
      },
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
      },
    );
  });

  it("8. catches LangChain OutputParserException and maps to SchemaValidationError", async () => {
    const parserFailingModel = RunnableLambda.from(async () => {
      const parserErr = new OutputParserException('Failed to parse: {"matchedSkills": 12345}');
      (parserErr as any).llmOutput = '{"matchedSkills": 12345}';
      throw parserErr;
    });

    await assert.rejects(
      async () => compareJobDescription(sampleResume, sampleJobDescription, parserFailingModel),
      (err: any) => {
        assert.ok(err instanceof SchemaValidationError, "Must throw SchemaValidationError");
        assert.ok(Array.isArray(err.issues), "Must attach issues array");
        return true;
      },
    );
  });

  it("9. accepts a valid comparison with empty arrays", async () => {
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

    const result = await compareJobDescription(sampleResume, sampleJobDescription, mockModel);

    assert.equal(result.overallFit, "weak");
    assert.deepEqual(result.matchedSkills, []);
    assert.deepEqual(result.relevantExperience, []);
  });

  it("10. never returns fallback or fabricated comparison data on model failure", async () => {
    const failingModel = RunnableLambda.from(async () => {
      throw new Error("Fatal server error");
    });

    let returnedValue = null;
    try {
      returnedValue = await compareJobDescription(sampleResume, sampleJobDescription, failingModel);
    } catch {
      // expected error
    }

    assert.equal(returnedValue, null, "Must never return fallback data");
  });
});

describe("compareStoredJob Service", () => {
  const sampleJobDescription =
    "Staff Backend Engineer\nRequirements: TypeScript, PostgreSQL, Kubernetes";

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
    improvementSuggestions: ["Gain hands-on experience with Kubernetes and container deployment."],
    overallFit: "moderate",
  };

  const mockDoc: DocumentRecord = {
    id: "doc-123",
    title: "resume.pdf",
    file_path: null,
    document_type: "resume",
    raw_text: "Jane Doe\nSenior Backend Engineer\nSkills: TypeScript, Node.js, PostgreSQL",
    metadata: {},
    created_at: new Date(),
    updated_at: new Date(),
  };

  const mockModel = RunnableLambda.from(async () => sampleValidComparison);

  it("1. retrieves stored document and returns structured JobComparisonOutput", async () => {
    let capturedId = "";
    const mockFinder = async (id: string): Promise<DocumentRecord | null> => {
      capturedId = id;
      return mockDoc;
    };

    const result = await compareStoredJob("doc-123", sampleJobDescription, {
      modelOverride: mockModel,
      documentFinder: mockFinder,
      retrievalOrchestrator: async () => [],
    });

    assert.equal(capturedId, "doc-123");
    assert.deepEqual(result, sampleValidComparison);
  });

  it("2. throws TypeError when documentId is missing, empty, or whitespace", async () => {
    await assert.rejects(
      async () => compareStoredJob("", sampleJobDescription),
      (err: unknown) => {
        assert.ok(err instanceof TypeError);
        assert.ok((err as Error).message.includes("Document ID must be a non-empty string"));
        return true;
      },
    );

    await assert.rejects(
      async () => compareStoredJob("   ", sampleJobDescription),
      (err: unknown) => {
        assert.ok(err instanceof TypeError);
        return true;
      },
    );

    await assert.rejects(
      async () => compareStoredJob(null as unknown as string, sampleJobDescription),
      (err: unknown) => {
        assert.ok(err instanceof TypeError);
        return true;
      },
    );
  });

  it("3. throws TypeError when jobDescription is missing, empty, or whitespace", async () => {
    await assert.rejects(
      async () => compareStoredJob("doc-123", ""),
      (err: unknown) => {
        assert.ok(err instanceof TypeError);
        assert.ok((err as Error).message.includes("Job description must be a non-empty string"));
        return true;
      },
    );

    await assert.rejects(
      async () => compareStoredJob("doc-123", "   "),
      (err: unknown) => {
        assert.ok(err instanceof TypeError);
        return true;
      },
    );

    await assert.rejects(
      async () => compareStoredJob("doc-123", null as unknown as string),
      (err: unknown) => {
        assert.ok(err instanceof TypeError);
        return true;
      },
    );
  });

  it("4. throws DocumentNotFoundError when document does not exist", async () => {
    const mockFinder = async (): Promise<DocumentRecord | null> => null;

    await assert.rejects(
      async () =>
        compareStoredJob("non-existent-doc", sampleJobDescription, {
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

  it("5. throws DocumentExtractionError when document has empty or null raw_text", async () => {
    const emptyDoc: DocumentRecord = {
      ...mockDoc,
      raw_text: null,
    };
    const mockFinderNull = async (): Promise<DocumentRecord | null> => emptyDoc;

    await assert.rejects(
      async () =>
        compareStoredJob("doc-123", sampleJobDescription, {
          modelOverride: mockModel,
          documentFinder: mockFinderNull,
        }),
      (err: unknown) => {
        assert.ok(err instanceof DocumentExtractionError);
        assert.ok((err as Error).message.includes("has no extracted text to compare"));
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
        compareStoredJob("doc-123", sampleJobDescription, {
          modelOverride: mockModel,
          documentFinder: mockFinderWhitespace,
        }),
      (err: unknown) => {
        assert.ok(err instanceof DocumentExtractionError);
        return true;
      },
    );
  });

  it("6. propagates schema validation and upstream AI errors correctly", async () => {
    const failingModel = RunnableLambda.from(async () => {
      throw new UpstreamAIError("Ollama failed during comparison");
    });
    const mockFinder = async (): Promise<DocumentRecord | null> => mockDoc;

    await assert.rejects(
      async () =>
        compareStoredJob("doc-123", sampleJobDescription, {
          modelOverride: failingModel,
          documentFinder: mockFinder,
          retrievalOrchestrator: async () => [],
        }),
      (err: unknown) => {
        assert.ok(err instanceof UpstreamAIError);
        return true;
      },
    );
  });

  it("7. retrieves relevant resume evidence using jobDescription as semantic query and formats context", async () => {
    let capturedQuery = "";
    let capturedDocId = "";
    let capturedResumeText = "";

    const sampleChunks: DocumentChunkWithDistanceRecord[] = [
      {
        id: "chunk-1",
        document_id: "doc-123",
        chunk_index: 0,
        content: "Jane Doe - Senior Backend Engineer with TypeScript and PostgreSQL.",
        metadata: {},
        embedding: [0.01, 0.02],
        distance: 0.12,
        created_at: new Date(),
      },
      {
        id: "chunk-2",
        document_id: "doc-123",
        chunk_index: 1,
        content: "Designed high-throughput distributed systems using Node.js and PostgreSQL.",
        metadata: {},
        embedding: [0.02, 0.03],
        distance: 0.18,
        created_at: new Date(),
      },
    ];

    const mockOrchestrator = async (
      params: RagRetrievalParams,
    ): Promise<DocumentChunkWithDistanceRecord[]> => {
      capturedDocId = params.documentId;
      capturedQuery = params.query;
      return sampleChunks;
    };

    const capturingModel = RunnableLambda.from(async (input: unknown) => {
      const typedInput = input as PromptTestInput;
      const humanMsg = typedInput?.messages?.find((m) => m._getType() === "human");
      capturedResumeText = typeof humanMsg?.content === "string" ? humanMsg.content : "";
      return sampleValidComparison;
    });

    const result = await compareStoredJob("doc-123", sampleJobDescription, {
      modelOverride: capturingModel,
      documentFinder: async () => mockDoc,
      retrievalOrchestrator: mockOrchestrator,
    });

    assert.equal(capturedDocId, "doc-123");
    assert.equal(capturedQuery, sampleJobDescription);
    assert.ok(
      capturedResumeText.includes("[Source 1]\nJane Doe - Senior Backend Engineer with TypeScript"),
    );
    assert.ok(
      capturedResumeText.includes("[Source 2]\nDesigned high-throughput distributed systems"),
    );
    assert.deepEqual(result, sampleValidComparison);
  });

  it("8. limits evidence chunks according to context budget", async () => {
    let capturedResumeText = "";

    // Create large chunks that exceed context limit
    const hugeChunk: DocumentChunkWithDistanceRecord = {
      id: "chunk-1",
      document_id: "doc-123",
      chunk_index: 0,
      content: "A".repeat(5000),
      metadata: {},
      embedding: [0.01],
      distance: 0.05,
      created_at: new Date(),
    };

    const mockOrchestrator = async (): Promise<DocumentChunkWithDistanceRecord[]> => [hugeChunk];

    const capturingModel = RunnableLambda.from(async (input: unknown) => {
      const typedInput = input as PromptTestInput;
      const humanMsg = typedInput?.messages?.find((m) => m._getType() === "human");
      capturedResumeText = typeof humanMsg?.content === "string" ? humanMsg.content : "";
      return sampleValidComparison;
    });

    await compareStoredJob("doc-123", sampleJobDescription, {
      modelOverride: capturingModel,
      documentFinder: async () => mockDoc,
      retrievalOrchestrator: mockOrchestrator,
    });

    // Content should be limited and not exceed default budget (4000 chars)
    assert.ok(capturedResumeText.length < 5000);
    assert.ok(capturedResumeText.includes("[Source 1]"));
  });

  it("9. gracefully falls back to stored raw_text when retrieval yields empty chunks", async () => {
    let capturedResumeText = "";

    const mockOrchestratorEmpty = async (): Promise<DocumentChunkWithDistanceRecord[]> => [];

    const capturingModel = RunnableLambda.from(async (input: unknown) => {
      const typedInput = input as PromptTestInput;
      const humanMsg = typedInput?.messages?.find((m) => m._getType() === "human");
      capturedResumeText = typeof humanMsg?.content === "string" ? humanMsg.content : "";
      return sampleValidComparison;
    });

    await compareStoredJob("doc-123", sampleJobDescription, {
      modelOverride: capturingModel,
      documentFinder: async () => mockDoc,
      retrievalOrchestrator: mockOrchestratorEmpty,
    });

    assert.ok(
      capturedResumeText.includes(mockDoc.raw_text!),
      "Should fall back to full document raw_text",
    );
    assert.ok(!capturedResumeText.includes("[Source 1]"));
  });

  it("10. propagates retrieval errors when embedding fails", async () => {
    const mockOrchestratorFailing = async (): Promise<DocumentChunkWithDistanceRecord[]> => {
      throw new UpstreamAIError("Embedding model offline");
    };

    await assert.rejects(
      async () =>
        compareStoredJob("doc-123", sampleJobDescription, {
          modelOverride: mockModel,
          documentFinder: async () => mockDoc,
          retrievalOrchestrator: mockOrchestratorFailing,
        }),
      (err: unknown) => {
        assert.ok(err instanceof UpstreamAIError);
        assert.ok((err as Error).message.includes("Embedding model offline"));
        return true;
      },
    );
  });
});
