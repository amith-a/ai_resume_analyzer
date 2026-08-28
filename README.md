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
     PostgreSQL   LangChain     Direct fetch()
     (+pgvector)      │            │
                      └─────┬──────┘
                            │
                            ▼
                         Ollama
                            │
                        Qwen 3 4B
```

---

## Tech Stack

- **Runtime & Language:** Node.js 24 (ESM), TypeScript (NodeNext resolution)
- **API Framework:** Express 5
- **AI & Orchestration:** Direct HTTP `fetch()` client, LangChain (`@langchain/ollama`, `@langchain/core`)
- **Local Model Serving:** Ollama with NVIDIA GPU acceleration (`qwen3:4b`)
- **Database:** PostgreSQL (with `pg` connection pool, ready for `pgvector`)
- **Validation:** Zod (runtime environment variable & structured payload validation)
- **Containerization:** Docker & Docker Compose with Compose Watch for live hot-reload

---

## Project Structure

```text
.
├── src/
│   ├── ai/
│   │   ├── langchain.ts       # LangChain ChatOllama wrapper
│   │   └── ollama.ts          # Low-level native fetch() client
│   ├── config/
│   │   ├── db.ts              # PostgreSQL connection pool
│   │   └── env.ts             # Zod-validated environment config
│   ├── routes/
│   │   ├── ai.routes.ts       # /ai/test & /ai/langchain/test
│   │   └── health.routes.ts   # /health, /health/db, /health/ollama
│   ├── app.ts                 # Express application & router bindings
│   └── server.ts              # Server lifecycle & graceful shutdown
├── docker-compose.yml         # Multi-container setup (API, Postgres, Ollama)
├── Dockerfile                 # Multi-stage Node.js container definition
├── PLAN.md                    # Detailed phased development roadmap
└── AGENTS.md                  # Persistent engineering guidelines & rules
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

### AI Inference Endpoints

#### 1. Native `fetch()` Ollama Endpoint
```bash
curl -X POST http://localhost:3000/ai/test \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Explain what an ATS is in two sentences."}'
```

**Response:**
```json
{
  "engine": "fetch",
  "data": "An Applicant Tracking System (ATS) is software used by employers..."
}
```

#### 2. LangChain Ollama Endpoint
```bash
curl -X POST http://localhost:3000/ai/langchain/test \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Say hello in one short sentence."}'
```

**Response:**
```json
{
  "engine": "langchain",
  "data": "Hello! How can I assist you today?"
}
```

---

## Development Guidelines

- **Roadmap:** Refer to [`PLAN.md`](file:///d:/code/ai_resume_analyzer/PLAN.md) for the active phase and upcoming features.
- **Engineering Principles:** Refer to [`AGENTS.md`](file:///d:/code/ai_resume_analyzer/AGENTS.md) for architectural rules, error handling, timeout guarantees, and security practices.
