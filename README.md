# AI Resume Analyzer

A production-conscious backend service for AI-powered resume analysis, demonstrating practical LLM workflows, structured extraction, vector embeddings, and RAG in **pure Node.js / TypeScript**.

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
      (+pgvector)      │       Ingestion
                       ▼
                    Ollama
                       │
                   Qwen 3 4B
```

---

## Tech Stack

- **Runtime & Language:** Node.js 24 (ESM), TypeScript (NodeNext resolution)
- **API Framework:** Express 5
- **AI & Orchestration:** LangChain (`@langchain/ollama`, `@langchain/core`)
- **Local Model Serving:** Ollama with NVIDIA GPU acceleration (`qwen3:4b`)
- **Document Processing:** `unpdf` (PDF), `mammoth` (DOCX), `file-type` (magic-byte detection), `multer` (upload)
- **Database:** PostgreSQL (with `pg` connection pool, ready for `pgvector`)
- **Validation:** Zod (runtime environment variable & structured schema validation)
- **Containerization:** Docker & Docker Compose with Compose Watch for live hot-reload

---

## Project Structure

```text
.
├── src/
│   ├── ai/
│   │   ├── prompts/
│   │   │   └── resume-analysis.prompt.ts  # Structured prompt template & system rules
│   │   └── schemas/
│   │       └── resume-analysis.schema.ts  # Zod schema for structured resume analysis
│   ├── config/
│   │   ├── db.ts                          # PostgreSQL connection pool
│   │   └── env.ts                         # Zod-validated environment config
│   ├── controllers/
│   │   └── resume.controller.ts           # Resume ingestion and analysis handlers
│   ├── errors/
│   │   └── index.ts                       # Typed domain/application errors
│   ├── middlewares/
│   │   ├── error.middleware.ts            # Centralized error-handling middleware
│   │   └── upload.middleware.ts           # Multer file upload & size limit validation
│   ├── routes/
│   │   ├── health.routes.ts               # /health, /health/db, /health/ollama
│   │   └── resume.routes.ts               # /resumes, /resumes/analyze
│   ├── services/
│   │   ├── extractor.service.ts           # In-memory PDF / DOCX text extraction
│   │   ├── resume-analyzer.service.ts     # LangChain structured LLM analysis
│   │   └── resume-ingest.service.ts       # Document validation & normalization
│   ├── types/
│   │   └── resume.types.ts                # Ingestion domain types
│   ├── utils/
│   │   ├── file-validator.util.ts         # Magic-byte MIME type detection
│   │   └── text-normalizer.util.ts        # Text and whitespace normalization
│   ├── app.ts                             # Express application & router bindings
│   └── server.ts                          # Server lifecycle & graceful shutdown
├── tests/                                 # Unit & integration test suites
├── docker-compose.yml                     # Multi-container setup (API, Postgres, Ollama)
├── Dockerfile                             # Multi-stage Node.js container definition
├── PLAN.md                                # Detailed phased development roadmap
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

OLLAMA_HOST=http://ollama:11434
OLLAMA_MODEL=qwen3:4b
```

### 2. Run with Docker Compose

Start all services (Node.js API with hot-reload watch, PostgreSQL, Ollama):

```bash
docker compose up --build
```

### 3. Pull the Ollama Model

On the first run, pull the `qwen3:4b` model inside the Ollama container:

```bash
docker exec -it ollama ollama pull qwen3:4b
```

---

## API Endpoints

### Health Checks

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/health` | API process liveness check |
| `GET` | `/health/db` | PostgreSQL connectivity check |
| `GET` | `/health/ollama` | Ollama service reachability check |

### Resume Endpoints

#### 1. Ingest & Extract Resume Text (`POST /resumes`)

Extracts and normalizes text from an uploaded PDF or DOCX file.

```bash
curl -X POST http://localhost:3000/resumes \
  -F "file=@/path/to/resume.pdf"
```

**Response (200 OK):**
```json
{
  "status": "success",
  "message": "Resume text extracted and normalized successfully",
  "data": {
    "filename": "resume.pdf",
    "size": 124500,
    "detectedMime": "application/pdf",
    "detectedExt": "pdf",
    "characterCount": 3450,
    "pageCount": 2,
    "text": "Jane Doe\nSoftware Engineer..."
  }
}
```

#### 2. Ingest & Analyze Resume with LLM (`POST /resumes/analyze`)

Extracts, normalizes, and analyzes an uploaded resume using LangChain and Ollama with structured Zod schema validation.

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

---

## Development Guidelines

- **Roadmap:** Refer to [`PLAN.md`](file:///d:/code/ai_resume_analyzer/PLAN.md) for the active phase and upcoming features.
- **Engineering Principles:** Refer to [`AGENTS.md`](file:///d:/code/ai_resume_analyzer/AGENTS.md) for architectural rules, error handling, timeout guarantees, and security practices.
