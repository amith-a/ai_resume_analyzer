# AI Resume Analyzer — Updated Project Plan

## Goal

Build a production-conscious AI Resume Analyzer that demonstrates practical
backend, LLM, embeddings, vector search, and RAG engineering.

The project should remain primarily Node.js/TypeScript based.

---

# Current Status

The following work has already been completed and verified:

- Node.js + TypeScript project foundation
- ESM-based Node.js setup
- Docker / Docker Compose
- PostgreSQL container
- Ollama container
- Ollama model setup
- NVIDIA GPU access verified from Docker
- `qwen3:4b` model available locally
- Docker networking between services
- Docker Compose Watch / development hot reload
- Node.js → Ollama communication using native `fetch()`
- Direct Ollama HTTP API tested successfully

Current working architecture:

Client
  ↓
Node.js API
  ↓ HTTP / fetch
Ollama
  ↓
Qwen 3 4B

---

# Architecture Direction

We will NOT add a separate Python AI service.

Python is not required for:

- LangChain
- embeddings
- pgvector
- vector search
- RAG
- agents
- Ollama integration

Keeping the application primarily in Node.js/TypeScript reduces unnecessary
service complexity while still allowing us to learn the important AI concepts.

Target architecture:

                 ┌──────────────┐
                 │   Frontend   │
                 └──────┬───────┘
                        │
                        ▼
              ┌──────────────────┐
              │    Node.js API   │
              │   TypeScript     │
              └───────┬──────────┘
                      │
          ┌───────────┼────────────┐
          │           │            │
          ▼           ▼            ▼
     PostgreSQL    LangChain    PDF/Text
       + pgvector      │         Processing
                       ▼
                    Ollama
                       │
                     Qwen

---

# Phase 1 — Infrastructure

## Completed

- Node.js
- TypeScript
- ESM
- Docker
- Docker Compose
- PostgreSQL
- Ollama
- Environment configuration
- Development workflow
- Docker networking
- Hot reload / Compose Watch

## Best Practices

- Use environment variables for configuration.
- Never commit `.env`.
- Keep `.env.example` updated.
- Use non-root users where appropriate.
- Keep Docker images minimal.
- Separate development and production concerns.
- Avoid unnecessary dependencies.
- Add health/readiness checks where appropriate.
- Keep service names stable for Docker networking.

---

# Phase 2 — Local LLM Infrastructure

## Completed

- Ollama running in Docker
- GPU access verified
- NVIDIA container runtime verified
- Qwen 3 4B downloaded
- Ollama API tested directly

Verified architecture:

curl
  ↓
Ollama
  ↓
Qwen 3 4B

---

# Phase 3 — Direct LLM Integration

## Completed

Node.js can communicate directly with Ollama using native `fetch()`.

Flow:

Node.js
  ↓
HTTP POST
  ↓
Ollama `/api/generate`
  ↓
Qwen
  ↓
response

The native `fetch()` implementation should be kept as a useful low-level
reference while we introduce higher-level abstractions.

## Important Concepts

Understand:

- HTTP-based model serving
- request/response lifecycle
- model loading latency
- inference latency
- streaming vs non-streaming responses
- model configuration
- timeouts
- error handling

Do not add unnecessary SDKs merely to call Ollama.

---

# Phase 4 — LangChain Fundamentals

## Completed

Introduce LangChain only after the direct Ollama integration is understood.

First reproduce the basic LLM call using LangChain.

Compare:

Node.js
  ↓
fetch()
  ↓
Ollama

with:

Node.js
  ↓
LangChain
  ↓
Ollama

## Learn

- What LangChain is
- What problem it solves
- Model abstractions
- Prompt templates
- Runnable pipelines
- Message handling
- Basic composition
- Streaming
- Error handling
- When LangChain is useful
- When direct model APIs are simpler

## Rule

Do not use LangChain simply because it is popular.

Every abstraction should have a clear reason.

---

# Phase 5 — Prompting and Structured Output

## Completed

Move from free-form LLM responses to reliable application data.

- Single source-of-truth Zod schema (`CandidateProfileSchema`)
- Prompt separation using `ChatPromptTemplate`
- LangChain `ChatOllama` structured output (`.withStructuredOutput`)
- Defensive runtime validation with Zod `safeParse`
- Explicit error boundaries (400, 422, 502)
- Tested and verified via `POST /ai/structured/test`


Example:

LLM
  ↓
structured schema
  ↓
validated object
  ↓
application logic

## Learn

- System prompts
- User prompts
- Prompt templates
- Structured output
- Schema validation
- Handling malformed model output
- Temperature/model configuration
- Token/context considerations

## Best Practices

- Never blindly trust LLM output.
- Validate structured responses.
- Keep prompts versioned with the application.
- Separate prompt construction from business logic.
- Handle model failures explicitly.

---

# Phase 6 — Resume File and Text Processing

## Completed

build the resume ingestion pipeline.

Flow:

PDF
  ↓
Text extraction
  ↓
Text cleanup / normalization
  ↓
Structured analysis

## Requirements

- Accept resume files safely.
- Validate file type.
- Enforce file-size limits.
- Avoid trusting client-provided MIME types alone.
- Handle malformed PDFs.
- Avoid storing unnecessary temporary files.
- Keep extracted text separate from raw file handling.

The LLM should receive extracted text, not arbitrary PDF bytes.

- In-memory upload handling with 5MB limit (`multer`)
- Buffer binary magic-bytes inspection (`file-type`)
- In-memory PDF extraction (`unpdf`) & DOCX extraction (`mammoth`)
- Deterministic text normalization utility (`normalizeResumeText`)
- Unit test suite (`tests/text-normalizer.test.ts`)
- Preserved error boundaries (400, 413, 415, 422)


---

# Phase 7 — Resume Analysis

## Completed

Analyze a resume and produce structured information.

Possible output:

- Candidate summary
- Skills
- Experience
- Education
- Projects
- Technologies
- Certifications
- Strengths
- Missing/unclear information

The exact schema should be designed before implementation.

Flow:

Resume
  ↓
Text extraction
  ↓
LLM
  ↓
Structured output
  ↓
Validation
  ↓
Application data

- Canonical `ResumeAnalysisSchema` and sub-schemas with inferred TypeScript types (`src/ai/schemas/resume-analysis.schema.ts`)
- Isolated `resumeAnalysisPrompt` template with fact-grounding, date nullability, and injection boundaries (`src/ai/prompts/resume-analysis.prompt.ts`)
- `analyzeResume()` service connecting `ChatOllama` structured output with 90s timeout and defensive `safeParse` validation (`src/services/resume-analyzer.service.ts`)
- `POST /resumes/analyze` endpoint integrated into `src/routes/resume.routes.ts` with standardized 400, 413, 415, 422, 502 error mapping
- 5 comprehensive test suites with LLM isolation passing all 41 unit & integration tests
- Verified end-to-end live inference against Ollama (`qwen3:4b`)


---

# Phase 8 — Job Description Comparison

## Completed

Compare a candidate resume against a job description.

Flow:

Resume
  +
Job Description
  ↓
LLM analysis
  ↓
Structured comparison

- Matching skills
- Missing skills
- Relevant experience
- Experience gaps
- Job-specific strengths
- Improvement suggestions

Avoid presenting an LLM-generated score as objectively accurate unless it
has been defined and evaluated properly.

Implemented:

- Canonical `JobComparisonInputSchema` and `JobComparisonOutputSchema` with inferred TypeScript types (`src/ai/schemas/job-comparison.schema.ts`)
- Isolated `jobComparisonPrompt` template with `<resume_text>` and `<job_description>` delimiters, fact grounding, qualitative `overallFit` bounds, and anti-fabrication rules (`src/ai/prompts/job-comparison.prompt.ts`)
- Stateless `compareJobDescription()` service connecting `ChatOllama` structured output with 180s timeout and defensive `safeParse` validation (`src/services/job-comparison.service.ts`)
- `POST /jobs/compare` endpoint integrated into `src/routes/job-comparison.routes.ts` and mounted in `src/app.ts`
- 5 comprehensive test suites with LLM isolation passing all 40 unit and integration tests

---

# Phase 9 — Embeddings

## Completed

Understand embeddings before implementing RAG.

Learn:

- What embeddings are
- Vector representation
- Similarity
- Cosine similarity
- Chunking
- Embedding dimensions
- Why embeddings are different from generation

Important distinction:

    LLM generation ≠ embeddings

Embeddings are introduced because we need semantic retrieval.

## Project Context

Understand how embeddings will eventually fit into this project:

Resume / Documents
  ↓
Chunking
  ↓
Embedding Model
  ↓
Vectors
  ↓
Vector Database
  ↓
Semantic Retrieval
  ↓
RAG
  ↓
LLM

The purpose is to understand this pipeline before implementing it.

## Scope

Do NOT implement:

- RAG
- Vector database
- Retrieval pipeline
- Embedding storage
- Production embedding infrastructure

Do not modify existing application behavior.

## Completion Criteria

Before moving to the next phase, be able to explain:

- What an embedding is.
- Why text is converted into vectors.
- What embedding dimensions mean.
- What semantic similarity means.
- How cosine similarity is used.
- Why documents need to be chunked.
- How embeddings differ from LLM generation.
- How embeddings will eventually enable semantic retrieval in this project.

## Covered

- Conceptual understanding of embeddings vs text generation (vector representations, dimensions, vector distance metrics)
- Semantic similarity principles (cosine similarity, dot product, Euclidean distance)
- Chunking strategies and tradeoffs
- Preparation for vector storage with pgvector and semantic retrieval


---

# Phase 10 — PostgreSQL + pgvector

## Completed

Add vector storage to PostgreSQL.

Architecture:

PostgreSQL
  ├── application data (documents)
  └── vector data (document_chunks with vector(768))

Learn:

- pgvector
- vector columns
- similarity search
- indexes
- metadata filtering
- vector distance
- tradeoffs of PostgreSQL + pgvector

Keep normal relational data and vector data logically separated.

Implemented:
- Docker setup updated to `pgvector/pgvector:pg18` with standard volume mount `/var/lib/postgresql/data`.
- Migration system established using `node-pg-migrate` (ESM) in `migrations/1740800000000_init_pgvector_and_schema.js`.
- Enabled `vector` extension and created relational `documents` table and `document_chunks` table with `vector(768)` (for target `nomic-embed-text` model).
- Established B-tree foreign key index and HNSW cosine vector index (`idx_document_chunks_embedding_hnsw USING hnsw (embedding vector_cosine_ops)`).
- Implemented defensive vector utilities in `src/utils/vector.utils.ts` for SQL formatting and parsing.
- Extended `/health/db` endpoint to verify both basic query execution and dynamically return active `pgvector` extension version.
- Added comprehensive unit and integration test suite covering pgvector operations, distance metrics (`<=>`, `<->`, `<#>`), filtering, and cascade deletion.

---

# Phase 11 — Retrieval

## completed

Build retrieval independently before calling it RAG.

Flow:

Query
  ↓
Embedding
  ↓
Vector search
  ↓
Top relevant chunks

Learn:

- Top-k retrieval
- similarity thresholds
- metadata filters
- chunk size
- overlap
- retrieval quality
- irrelevant results

## Covered

- **Embedding Service (`src/services/embedding.service.ts`)**:
  - `embedText()` and `embedChunks()` using Ollama `nomic-embed-text` (768 dimensions).
  - Bounded timeouts, vector dimension validation, and upstream AI error mapping.
- **Document & Chunk Storage (`src/repositories/document.repository.ts`, `src/services/document-storage.service.ts`)**:
  - `storeDocumentWithChunks()` orchestrating parent document insertion, chunking, embedding generation, and atomic PostgreSQL transactions.
  - Cascade deletion and read-back verification.
- **Vector Retrieval with pgvector**:
  - Cosine distance similarity ordering (`ORDER BY embedding <=> $2::vector ASC`).
  - Scoped strictly by `document_id`.
- **Top-K Retrieval**:
  - Parameterized `LIMIT $3` with strict validation rejecting non-positive integers, floats, and NaN with `RangeError`.
- **Similarity Threshold**:
  - Maximum allowable cosine distance threshold (`(embedding <=> $2::vector) <= $4`) returning only qualifying chunks.
- **Metadata Filtering**:
  - Safe parameterized JSONB containment filtering (`metadata @> $5::jsonb`) preventing SQL injection.
- **Retrieval Service (`src/services/retrieval.service.ts`)**:
  - `retrieveChunks()` orchestrating query embedding generation, parameter validation, and vector repository search without database SQL in the service layer.
  - Clean dependency injection for testability.
- **Retrieval API Endpoint (`src/routes/retrieval.routes.ts`, `src/controllers/retrieval.controller.ts`)**:
  - `POST /retrieval/chunks` with input validation and clean JSON response formatting.
- **Connected Resume Ingestion & Indexing (`src/controllers/resume.controller.ts`)**:
  - `POST /resumes` full pipeline: validation → extraction → normalization → document creation → chunking → embedding → PostgreSQL/pgvector storage.


---

# Phase 12 — RAG

## Objective

Combine retrieval with generation.

Architecture:

User Query
  ↓
Query Embedding
  ↓
Vector Search
  ↓
Relevant Context
  ↓
Prompt
  ↓
LLM
  ↓
Grounded Answer

Understand:

- Retrieval-augmented generation
- Context injection
- Grounding
- Context limits
- Citation/source tracking
- Retrieval failures
- Hallucination risks

Do not introduce RAG before the retrieval pipeline is understood.

---

# Phase 13 — Grounding and Evaluation

## Objective

Make AI output more trustworthy.

Learn:

- Grounding
- Source attribution
- Hallucination detection
- Retrieval evaluation
- Answer evaluation
- Golden test cases
- Regression testing
- Failure analysis

The system should distinguish between:

- information found in the resume/job data
- model-generated interpretation
- information that is unavailable

---

# Phase 14 — Production Backend Practices

Apply production practices throughout the project rather than waiting until
the end.

## Configuration

- Validate required environment variables at startup.
- Keep secrets out of source control.
- Use typed configuration where practical.

## API

- Request validation
- Response validation
- Consistent error responses
- Centralized error handling
- Appropriate HTTP status codes
- Request size limits
- Timeouts

## Database

- Connection pooling
- Proper indexes
- Transactions where required
- Migration strategy
- Graceful shutdown

## AI

- Model timeouts
- Retry only where appropriate
- Avoid unbounded prompts
- Input limits
- Structured output validation
- Logging without exposing sensitive resume content

## Security

- File upload validation
- File size limits
- Safe temporary-file handling
- No arbitrary file execution
- No secrets in logs
- Dependency hygiene

## Observability

- Useful structured logs
- Request IDs/correlation IDs where appropriate
- AI latency tracking
- Error tracking
- Database/query monitoring

---

# Phase 15 — Frontend

Build a basic frontend after the backend and AI pipeline are stable.

Core workflow:

1. Upload resume
2. Provide job description
3. Submit analysis
4. Show structured analysis
5. Show comparison
6. Show relevant retrieved information where applicable

Keep frontend responsibilities separate from AI/business logic.

---

# Phase 16 — Testing

## Unit Tests

Test:

- validators
- configuration
- services
- parsing
- transformation
- retrieval logic

## Integration Tests

Test:

- API → database
- API → Ollama
- AI pipeline
- pgvector retrieval

## AI Tests

Create fixed test cases for:

- resume extraction
- structured analysis
- job comparison
- retrieval
- RAG answers

Do not rely only on manually checking model responses.

---

# Phase 17 — Docker and Production Hardening

Final hardening:

- Non-root containers
- Minimal images
- Correct health checks
- Production commands
- No development volume mounts in production
- Dependency installation optimized for production
- Environment-specific configuration
- Graceful shutdown
- Resource limits where appropriate
- Persistent PostgreSQL storage
- Persistent model storage where appropriate

Development:

Docker Compose Watch
  ↓
source changes
  ↓
container development process

Production:

built immutable image
  ↓
container
  ↓
application

---

# Phase 18 — Final Architecture

Final target:

                         Frontend
                            │
                            ▼
                    ┌──────────────┐
                    │   Node.js    │
                    │  TypeScript  │
                    └──────┬───────┘
                           │
              ┌────────────┼─────────────┐
              │            │             │
              ▼            ▼             ▼
         PostgreSQL     LangChain     File Processing
          + pgvector        │
              ▲             ▼
              │          Ollama
              │             │
              │           Qwen
              │
              └──── Retrieval / RAG




## Final Public API Contract

The final system exposes the following public APIs. These responsibilities are architectural requirements and must not be changed without explicit approval.

### 1. `POST /resumes`

**Purpose:** Upload and index a resume.

```text
Resume file
    ↓
Validate
    ↓
Extract text
    ↓
Normalize text
    ↓
Create/store parent document
    ↓
Chunk document
    ↓
Generate embeddings
    ↓
Store chunks + embeddings in PostgreSQL/pgvector
    ↓
Return document/resume ID
```

This is the primary resume ingestion/indexing endpoint.

The resume should be uploaded and indexed once. Downstream operations should reuse the resulting document/resume ID instead of repeatedly processing the same CV.

---

### 2. `POST /resumes/analyze`

**Purpose:** Generate a structured analysis/profile of an already-ingested resume.

```text
Document/resume ID
    ↓
Retrieve resume information
    ↓
LLM analysis
    ↓
Structured validation
    ↓
Return ResumeAnalysis
```

This endpoint is primarily for structured resume analysis.

It must reuse the existing analysis schemas and LLM output structure unless a change is explicitly required.

---

### 3. `POST /jobs/compare`

**Purpose:** Compare an existing resume against a job description.

```text
Document/resume ID
        +
Job description
        ↓
Retrieve relevant resume evidence
        ↓
Combine resume evidence + job description
        ↓
LLM
        ↓
Structured comparison
        ↓
Return comparison result
```

This is a RAG-oriented use case.

The resume should normally be referenced by its existing document/resume ID rather than re-uploaded and re-indexed.

If the API contract supports direct resume upload as an alternative, that upload must follow the same ingestion/indexing pipeline rather than creating a separate processing path.

---

### 4. `POST /search/chunks`

**Purpose:** Perform semantic search across indexed resume chunks.

```text
Search query
    ↓
Generate query embedding
    ↓
Vector search in pgvector
    ↓
Apply top-K
    ↓
Apply similarity threshold
    ↓
Apply supported metadata filters
    ↓
Return relevant chunks
```

This endpoint exposes the retrieval capability independently of the LLM.

It is used to validate and demonstrate the semantic retrieval system.

It must not require an LLM to perform the search.

---

### 5. `POST /resumes/:id/ask`

**Purpose:** Answer a question about one specific resume using retrieved resume evidence.

```text
Resume/document ID
        +
Question
        ↓
Generate query embedding
        ↓
Retrieve relevant chunks for that document
        ↓
Apply retrieval rules
        ↓
Pass retrieved evidence to LLM
        ↓
Generate grounded answer
        ↓
Return answer
```

Retrieval must be restricted to the requested resume/document ID.

The answer should be grounded in the retrieved resume evidence and should not invent information that is not supported by the resume.

---

## API Responsibility Boundaries

The public APIs must remain separated by responsibility:

```text
POST /resumes
    → ingestion + indexing

POST /resumes/analyze
    → structured resume analysis

POST /jobs/compare
    → resume/job comparison using relevant resume evidence

POST /search/chunks
    → semantic retrieval only

POST /resumes/:id/ask
    → resume-specific RAG question answering
```

### Internal services

The following are internal components, not public APIs:

```text
Document ingestion
Text extraction
Chunking
Embedding generation
Vector storage
Vector retrieval
Similarity filtering
Metadata filtering
LLM generation
```

These components should be reused by the public APIs rather than duplicated inside individual controllers.

## API Evolution Rule

The current implementation may temporarily differ from this final contract while the project is being built.

Do not treat the current implementation as the final architecture.

Implement toward this final contract incrementally while preserving existing functionality and schemas wherever possible.

Do not introduce additional public endpoints or alternate flows without explicit approval.

---

# What We Will NOT Add Unless There Is a Clear Requirement

- Separate Python AI service
- Unnecessary microservices
- Unnecessary SDKs
- Agents before the core pipeline is understood
- RAG before retrieval is understood
- Vector DB before embeddings are understood
- Complex orchestration before simple flows work

---

# Current Next Step

We are currently at:

Phase 9 — Embeddings ✅
Phase 10 — PostgreSQL + pgvector ✅
Phase 11 — Retrieval & Ingestion ✅

The next implementation task is:

Phase 12 — Context Assembly & Grounding

First tasks:

1. Design structured prompt context assembler combining retrieved chunks and document evidence.
2. Implement strict grounding rules and token/budget controls to prevent hallucination.
3. Test context assembly and formatting independently with deterministic test fixtures.




---

# Development Principle

Prefer:

simple → understood → tested → composed → optimized

Do not introduce technology merely because it is common in AI projects.

Every component should have a clear responsibility and a clear reason for
existing.
