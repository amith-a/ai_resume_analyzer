# AI Resume Analyzer

A production-conscious backend service for AI-powered resume analysis, demonstrating practical LLM workflows, structured extraction, vector embeddings, semantic retrieval, and RAG in **pure Node.js / TypeScript**.

---

## Architecture

```text
                 ┌──────────────┐
                 │   Frontend   │
                 └──────┬───────┘
                        │
                        ▼
               ┌──────────────────┐
               │   Node.js API    │
               │  (Express + TS)  │
               └───────┬──────────┘
                       │
           ┌───────────┼────────────┐
           │           │            │
           ▼           ▼            ▼
      PostgreSQL   LangChain   PDF / DOCX
     (+ pgvector)      │       Ingestion
           ▲           ▼
           │        Ollama
           │        ├── Qwen 3 4B (LLM)
           │        └── Nomic Embed Text (Embeddings)
           │
           └──── Semantic Retrieval & RAG Pipeline
```

---

## Tech Stack

- **Runtime & Language:** Node.js 24 (ESM), TypeScript (NodeNext resolution)
- **API Framework:** Express 5
- **AI & Orchestration:** LangChain (`@langchain/ollama`, `@langchain/core`)
- **Local Model Serving:** Ollama with NVIDIA GPU acceleration
  - **Generation LLM:** `qwen3:4b`
  - **Embedding Model:** `nomic-embed-text` (768 dimensions)
- **Document Processing:** `unpdf` (PDF), `mammoth` (DOCX), `file-type` (magic-byte detection), `multer` (upload)
- **Database & Vectors:** PostgreSQL 18 with `pgvector` (`pgvector/pgvector:pg18`), 768-dimension vectors with HNSW cosine indexes
- **Database Migrations:** `node-pg-migrate` (TypeScript/ESM)
- **Validation:** Zod (runtime environment variable, API request, and structured LLM schema validation)
- **Containerization:** Docker & Docker Compose with Compose Watch for live hot-reload

---

## Project Structure

```text
.
├── migrations/                            # Database migrations (node-pg-migrate)
│   └── 1740800000000_init_pgvector_and_schema.ts
├── src/
│   ├── ai/
│   │   ├── prompts/
│   │   │   ├── job-comparison.prompt.ts   # Prompt template for resume vs JD comparison
│   │   │   ├── rag.prompt.ts              # Grounded RAG ChatPromptTemplate
│   │   │   └── resume-analysis.prompt.ts  # Structured prompt template & system rules
│   │   ├── schemas/
│   │   │   ├── job-comparison.schema.ts   # Zod schema for structured job comparison
│   │   │   └── resume-analysis.schema.ts  # Zod schema for structured resume analysis
│   │   ├── error-handler.ts               # Centralized LLM error & OutputParser handling
│   │   └── model-factory.ts               # Structured LangChain ChatOllama & OllamaEmbeddings factory
│   ├── config/
│   │   ├── db.ts                          # PostgreSQL connection pool
│   │   └── env.ts                         # Zod-validated environment config
│   ├── controllers/
│   │   ├── job-comparison.controller.ts   # Job description comparison handler
│   │   ├── resume.controller.ts           # Resume ingestion, structured analysis, and RAG ask handlers
│   │   └── retrieval.controller.ts        # Semantic vector chunk retrieval handler
│   ├── errors/
│   │   └── index.ts                       # Typed domain/application errors
│   ├── middlewares/
│   │   ├── error.middleware.ts            # Centralized error-handling middleware
│   │   ├── upload.middleware.ts           # Multer file upload & size limit validation
│   │   └── validation.middleware.ts       # Zod request body/query/params validation
│   ├── repositories/
│   │   └── document.repository.ts         # Pure SQL queries for documents, chunks, and vector similarity
│   ├── routes/
│   │   ├── health.routes.ts               # /health, /health/db, /health/ollama
│   │   ├── job-comparison.routes.ts       # /jobs/compare
│   │   ├── resume.routes.ts               # /resumes, /resumes/analyze, /resumes/:id/ask
│   │   └── retrieval.routes.ts            # /retrieval/chunks
│   ├── schemas/
│   │   ├── ask-resume-request.schema.ts   # Validation schema for /resumes/:id/ask
│   │   ├── job-comparison-request.schema.ts # Validation schema for /jobs/compare
│   │   └── retrieval-request.schema.ts    # Validation schema for /retrieval/chunks
│   ├── services/
│   │   ├── document-storage.service.ts    # Transactional document & chunk persistence
│   │   ├── embedding.service.ts           # Ollama 768-dim text and chunk embeddings
│   │   ├── extractor.service.ts           # In-memory PDF / DOCX text extraction
│   │   ├── grounded-answer.service.ts     # Safe deterministic grounded answer evaluation
│   │   ├── job-comparison.service.ts      # LangChain structured job comparison
│   │   ├── rag-generation.service.ts      # RAG LLM chat answer generation
│   │   ├── rag-retrieval.service.ts       # Query embedding & vector search orchestration
│   │   ├── resume-analyzer.service.ts     # LangChain structured LLM analysis
│   │   ├── resume-ingest.service.ts       # Document validation & normalization
│   │   ├── retrieval.service.ts           # Vector similarity retrieval against pgvector
│   │   └── source-tracker.service.ts      # Grounded source citation mapping
│   ├── types/
│   │   ├── document.types.ts              # Document, chunk, and retrieval domain types
│   │   └── resume.types.ts                # Ingestion domain types
│   ├── utils/
│   │   ├── chunker.util.ts                # Recursive paragraph & sentence chunking
│   │   ├── context-builder.util.ts        # RAG [Source N] context formatter
│   │   ├── context-limiter.util.ts        # Deterministic context budget limiter
│   │   ├── file-validator.util.ts         # Magic-byte MIME type detection
│   │   ├── text-normalizer.util.ts        # Text and whitespace normalization
│   │   └── vector.utils.ts                # PostgreSQL pgvector literal formatting & parsing
│   ├── app.ts                             # Express application & router bindings
│   └── server.ts                          # Server lifecycle & graceful shutdown
├── tests/                                 # Unit & integration test suites (Node.js test runner)
├── docker-compose.yml                     # Multi-container setup (API, Postgres + pgvector, Ollama)
├── Dockerfile                             # Multi-stage Node.js container definition
├── PLAN.md                                # Phased development roadmap
└── AGENTS.md                              # Persistent engineering guidelines & rules
```

---

## Prerequisites

- **Docker Desktop** (with WSL2 backend on Windows)
- *(Optional for GPU acceleration)* **NVIDIA GPU** + **NVIDIA Container Toolkit**
- **Node.js 22+** & **npm** (if running locally outside Docker)

---

## Getting Started

### 1. Clone & Configure Environment

```bash
cp .env.example .env
```

Review `.env` settings:

```env
NODE_ENV=development
PORT=3000

POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=resume_db

DATABASE_URL=postgresql://postgres:postgres@postgres:5432/resume_db
DATABASE_URL_TEST=postgresql://postgres:postgres@postgres:5432/resume_test_db

OLLAMA_HOST=http://ollama:11434
OLLAMA_MODEL=qwen3:4b
OLLAMA_EMBEDDING_MODEL=nomic-embed-text
LLM_TIMEOUT_MS=180000
EMBEDDING_TIMEOUT_MS=60000
CHUNK_SIZE=500
CHUNK_OVERLAP=100
RAG_MAX_CONTEXT_CHARACTERS=4000
```

### 2. Run with Docker Compose

Start all services (Node.js API with hot-reload watch, PostgreSQL with pgvector, Ollama):

```bash
docker compose up --build
```

### 3. Run Database Migrations

Apply database migrations to create the pgvector extension, documents table, and document chunks vector tables:

```bash
docker compose exec node-api npm run migrate:up
```

### 4. Pull Ollama Models

Pull the required LLM and embedding models inside the Ollama container:

```bash
# Generation model (Qwen 3 4B)
docker exec -it ollama ollama pull qwen3:4b

# Embedding model (768 dimensions)
docker exec -it ollama ollama pull nomic-embed-text
```

---

## Running Tests

The test suite runs using the native Node.js test runner with `tsx`.

### In Docker (Recommended)

```bash
# Run all unit and integration test suites
docker compose exec node-api npm test

# Run specific test suites
docker compose exec node-api npx tsx --test tests/resume-ask.integration.test.ts
docker compose exec node-api npx tsx --test tests/retrieval.routes.test.ts
```

### On Host Machine

```bash
# Windows PowerShell
npm.cmd test

# Specific test file
npx.cmd tsx --test tests/resume-ask.integration.test.ts
```

---

## API Endpoints

### Health Checks

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/health` | API process liveness check |
| `GET` | `/health/db` | PostgreSQL connectivity check and active `pgvector` extension version |
| `GET` | `/health/ollama` | Ollama service reachability check |

---

### Resume Ingestion, Analysis & RAG

#### 1. Ingest, Extract & Index Resume (`POST /resumes`)

Extracts and normalizes text from an uploaded PDF or DOCX file, chunks the text, computes 768-dim embeddings, and persists the document and chunks to PostgreSQL / pgvector in a single atomic transaction.

```bash
curl -X POST http://localhost:3000/resumes \
  -F "file=@/path/to/resume.pdf"
```

**Response (200 OK):**
```json
{
  "status": "success",
  "message": "Resume processed and indexed successfully",
  "data": {
    "documentId": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
    "filename": "resume.pdf",
    "size": 124500,
    "detectedMime": "application/pdf",
    "detectedExt": "pdf",
    "characterCount": 3450,
    "pageCount": 2,
    "chunkCount": 8,
    "text": "Jane Doe\nSoftware Engineer..."
  }
}
```

#### 2. Structured Resume Analysis (`POST /resumes/analyze`)

Extracts, normalizes, and analyzes an uploaded resume using LangChain and Ollama with structured `ResumeAnalysisSchema` Zod validation.

```bash
curl -X POST http://localhost:3000/resumes/analyze \
  -F "file=@/path/to/resume.pdf"
```

**Response (200 OK):**
```json
{
  "status": "success",
  "message": "Resume analyzed successfully",
  "data": {
    "candidateSummary": "Staff Backend Engineer with 10 years experience in distributed systems.",
    "skills": ["Distributed Systems", "Cloud Architecture", "TypeScript", "Node.js"],
    "experience": [
      {
        "company": "Acme Corp",
        "role": "Staff Engineer",
        "startYear": 2020,
        "endYear": null,
        "description": "Designed core microservices processing 100M+ daily events."
      }
    ],
    "education": [
      {
        "institution": "Stanford University",
        "degree": "B.S.",
        "field": "Computer Science",
        "startYear": 2010,
        "endYear": 2014
      }
    ],
    "projects": [
      {
        "name": "Distributed Stream Engine",
        "description": "Real-time stream pipeline built with Node.js and Kafka.",
        "technologies": ["Node.js", "Kafka", "TypeScript"]
      }
    ],
    "technologies": ["Node.js", "TypeScript", "Docker", "PostgreSQL"],
    "certifications": ["AWS Certified Solutions Architect"],
    "strengths": ["System Design", "Scalability", "Mentorship"],
    "missingOrUnclear": []
  }
}
```

#### 3. Ask Questions on Resume via RAG (`POST /resumes/:id/ask`)

Answers questions about an already-indexed resume using scoped vector retrieval, deterministic context limits, LLM chat generation, grounding fallback, and citation tracking.

```bash
curl -X POST http://localhost:3000/resumes/a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d/ask \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What is the candidate experience with distributed systems and TypeScript?"
  }'
```

**Response (200 OK):**
```json
{
  "status": "success",
  "data": {
    "answer": "Jane Doe is a Staff Backend Engineer with 10 years of experience designing core microservices and distributed stream processing pipelines using TypeScript and Node.js.",
    "sources": [
      {
        "id": "c1d2e3f4-5678-90ab-cdef-1234567890ab",
        "chunkIndex": 0,
        "documentId": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d"
      }
    ]
  }
}
```

*When no relevant context exists:*
```json
{
  "status": "success",
  "data": {
    "answer": "The information is not available in the provided resume context.",
    "sources": []
  }
}
```

---

### Semantic Retrieval

#### 4. Semantic Chunk Search (`POST /retrieval/chunks`)

Queries stored document chunks using natural language similarity, pgvector cosine distance (`<=>`), optional distance thresholding, and metadata filtering.

```bash
curl -X POST http://localhost:3000/retrieval/chunks \
  -H "Content-Type: application/json" \
  -d '{
    "query": "backend developer with PostgreSQL and AWS experience",
    "documentId": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
    "topK": 3,
    "maxDistanceThreshold": 0.4,
    "metadataFilter": {
      "section": "experience"
    }
  }'
```

**Parameters:**

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `query` | `string` | **Yes** | Natural language retrieval query |
| `documentId` | `string` | **Yes** | Document UUID to search within |
| `topK` | `number` | No | Maximum number of chunks to return (default: `5`) |
| `maxDistanceThreshold` | `number` | No | Maximum allowable cosine distance (e.g. `0.4`) |
| `metadataFilter` | `object` | No | Key-value constraints for chunk JSON metadata |

**Response (200 OK):**
```json
{
  "chunks": [
    {
      "id": "c1d2e3f4-5678-90ab-cdef-1234567890ab",
      "document_id": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
      "chunk_index": 0,
      "content": "Staff Backend Engineer at Acme Corp. Designed core PostgreSQL database architecture and AWS cloud microservices.",
      "metadata": {
        "section": "experience"
      },
      "distance": 0.1184
    }
  ]
}
```

---

### Job Description Comparison

#### 5. Compare Resume Against Job Description (`POST /jobs/compare`)

Ingests a candidate resume file (PDF or DOCX), extracts/normalizes text, and performs a comprehensive fit analysis against target job description requirements using LangChain and Ollama.

```bash
curl -X POST http://localhost:3000/jobs/compare \
  -F "file=@/path/to/resume.pdf" \
  -F "jobDescription=Looking for a Senior Backend Engineer with TypeScript, PostgreSQL, and Kubernetes experience."
```

**Response (200 OK):**
```json
{
  "status": "success",
  "message": "Job description comparison completed successfully",
  "data": {
    "matchedSkills": ["TypeScript", "PostgreSQL", "Node.js"],
    "missingSkills": ["Kubernetes"],
    "relevantExperience": [
      {
        "role": "Staff Engineer",
        "company": "Acme Corp",
        "years": 4,
        "relevance": "Directly matches required TypeScript and high-scale PostgreSQL database design."
      }
    ],
    "experienceGaps": [
      "Candidate lacks hands-on experience with multi-cluster Kubernetes orchestration in production."
    ],
    "relevantProjects": [
      {
        "name": "Distributed Stream Engine",
        "relevance": "Demonstrates asynchronous system design with Node.js and distributed streaming."
      }
    ],
    "strengths": [
      "Extensive background in TypeScript microservices and relational database architecture."
    ],
    "gaps": [
      "No direct Kubernetes deployment experience mentioned in resume."
    ],
    "improvementSuggestions": [
      "Highlight any container deployment experience or obtain CKA certification."
    ],
    "overallFit": "moderate"
  }
}
```

---

## Development Guidelines

- **Roadmap:** Refer to [`PLAN.md`](PLAN.md) for current status, covered features, and upcoming phases.
- **Engineering Principles:** Refer to [`AGENTS.md`](AGENTS.md) for persistent rules, architectural boundaries, and coding standards.
