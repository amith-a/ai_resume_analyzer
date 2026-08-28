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

## Objective

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

---

# Phase 8 — Job Description Comparison

## Objective

Compare a resume against a job description.

Flow:

Resume
  +
Job Description
  ↓
LLM analysis
  ↓
Structured comparison

Possible results:

- Matching skills
- Missing skills
- Relevant experience
- Experience gaps
- Job-specific strengths
- Improvement suggestions

Avoid presenting an LLM-generated score as objectively accurate unless it
has been defined and evaluated properly.

---

# Phase 9 — Embeddings

## Objective

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

---

# Phase 10 — PostgreSQL + pgvector

## Objective

Add vector storage to PostgreSQL.

Architecture:

PostgreSQL
  ├── application data
  └── vector data

Learn:

- pgvector
- vector columns
- similarity search
- indexes
- metadata filtering
- vector distance
- tradeoffs of PostgreSQL + pgvector

Keep normal relational data and vector data logically separated.

---

# Phase 11 — Retrieval

## Objective

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

Phase 6 — Resume File and Text Processing ✅

The next implementation task is:

Phase 7 — Resume Analysis

First task:

1. Connect the normalized resume text pipeline to the structured analysis engine.
2. Analyze candidate details (summary, skills, experience, education) using the schema.
3. Validate and return the structured candidate profile.



---

# Development Principle

Prefer:

simple → understood → tested → composed → optimized

Do not introduce technology merely because it is common in AI projects.

Every component should have a clear responsibility and a clear reason for
existing.
