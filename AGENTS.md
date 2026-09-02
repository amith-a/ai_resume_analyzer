# AGENTS.md — AI Resume Analyzer

## Purpose

This file contains the persistent engineering instructions for the AI Resume Analyzer.

The project roadmap is defined in:

    PLAN.md

The coding agent MUST read and follow `PLAN.md` before implementing new phases.

This file defines HOW the agent should work.

---

# 1. Project Architecture

The project is primarily a Node.js / TypeScript application.

Target architecture:

Frontend
   ↓
Node.js API
   ↓
LangChain
   ↓
Ollama
   ↓
Qwen

PostgreSQL is used for application data.

PostgreSQL + pgvector is used later for vector storage and retrieval.

Do NOT introduce a separate Python AI service unless the project requirements explicitly change and the user approves it.

---

# 2. Current Project State

The following has already been implemented and verified:

- Node.js + TypeScript
- ESM
- Docker
- Docker Compose
- PostgreSQL
- Ollama
- Qwen 3 4B
- NVIDIA GPU access from Docker
- Docker networking
- Docker Compose Watch
- Node.js → Ollama communication
- Native Node.js `fetch()` integration

Current working flow:

Node.js
   ↓
native fetch()
   ↓
Ollama
   ↓
Qwen 3 4B

Do NOT recreate or unnecessarily replace these components.

---

# 3. Follow the Plan

`PLAN.md` is the source of truth for project progression.

Before starting a new feature:

1. Read the relevant phase in `PLAN.md`.
2. Check what has already been implemented.
3. Identify the smallest next implementation step.
4. Implement only that step.
5. Verify it.
6. Update documentation if required.
7. Stop at the phase boundary unless the user explicitly asks to continue.

Do NOT skip phases simply because later functionality appears easy.

---

# 4. Do Not Over-Engineer

Prefer:

simple
  ↓
understood
  ↓
tested
  ↓
composed
  ↓
optimized

Do not introduce infrastructure, libraries, abstractions, or services without a clear reason.

Avoid:

- unnecessary microservices
- unnecessary SDKs
- unnecessary abstractions
- premature optimization
- speculative infrastructure
- duplicate functionality

---

# 5. Dependency Rules

Before adding a dependency:

1. Check whether Node.js already provides the capability.
2. Check whether an existing dependency already provides it.
3. Determine whether the dependency is actually needed.
4. Prefer well-maintained, established packages.
5. Avoid adding packages for trivial functionality.

Keep dependencies minimal.

Do not add:

- Python services
- RAG libraries
- embedding libraries
- agent frameworks
- vector database clients
- LangGraph

unless the current project phase requires them.

---

# 6. LangChain Rules

LangChain is introduced only after the direct Ollama integration is understood.

When implementing LangChain:

- First reproduce the existing simple LLM call.
- Compare it with the native `fetch()` implementation.
- Understand what abstraction LangChain provides.
- Do not use LangChain simply because it is popular.

Learn and implement progressively:

1. Model integration
2. Prompt templates
3. Message handling
4. Runnable pipelines
5. Structured output
6. Streaming
7. Composition

Do not introduce agents before the core LLM pipeline is understood.

---

# 7. AI Output Must Be Treated as Untrusted

Never assume an LLM response is correct.

For structured output:

LLM
  ↓
schema validation
  ↓
application logic

Always validate model-generated structured data before using it.

Handle:

- malformed output
- missing fields
- unexpected values
- model failures
- timeouts
- empty responses

Do not silently accept invalid model output.

---

# 8. Prompt Engineering

Keep prompts separate from business logic where practical.

Prefer:

prompt definition
    ↓
model invocation
    ↓
structured validation
    ↓
business logic

Avoid scattering large prompt strings throughout controllers and services.

Prompts should be easy to locate, review, and change.

Do not put secrets or sensitive configuration inside prompts.

---

# 9. Resume Processing

The resume pipeline should remain separate from LLM inference.

Expected flow:

Resume file
   ↓
file validation
   ↓
PDF/text extraction
   ↓
text normalization
   ↓
LLM analysis
   ↓
structured validation
   ↓
application data

The LLM should not receive arbitrary PDF bytes.

File handling must include:

- file type validation
- file size limits
- safe temporary-file handling
- malformed-file handling
- cleanup of temporary files

Do not trust client-provided MIME types alone.

---

# 10. RAG Rules

Do NOT introduce RAG until embeddings and retrieval are understood.

The progression is:

LLM
  ↓
structured output
  ↓
resume analysis
  ↓
job comparison
  ↓
embeddings
  ↓
pgvector
  ↓
retrieval
  ↓
RAG

Keep these concepts separate.

Do not describe a system as "RAG" simply because it uses an LLM and a database.

---

# 11. Embedding Rules

Before implementing embeddings, understand:

- what an embedding represents
- vector dimensions
- similarity
- cosine similarity / vector distance
- chunking
- metadata
- retrieval

Embedding generation and text generation are different operations.

Do not use embeddings where a normal database query is sufficient.

---

# 12. Vector Database Rules

Use PostgreSQL + pgvector as defined by the project plan.

Keep:

- normal relational application data
- vector data

logically separated.

Consider:

- indexes
- metadata filtering
- similarity thresholds
- top-k retrieval
- chunk size
- chunk overlap

Do not add a separate vector database unless a real project requirement justifies it.

---

# 13. API Design

Keep controllers/routes thin.

Preferred structure:

Route / Controller
    ↓
Service
    ↓
Repository / external integration

Do not put large business-logic blocks directly inside Express route handlers.

Validate request input at the API boundary.

Return appropriate HTTP status codes.

Use consistent error responses.

Do not expose internal stack traces or implementation details to clients.

---

# 14. Error Handling

Use centralized error handling where appropriate.

Errors should:

- contain useful internal context
- expose safe client-facing messages
- use appropriate HTTP status codes
- be logged appropriately

Do not:

- swallow errors
- return `200` for failed operations
- expose secrets
- expose stack traces in production

External service failures must be handled explicitly.

---

# 15. Timeouts

Every external/network operation must have an appropriate timeout.

This includes:

- Ollama requests
- future embedding requests
- database operations where appropriate
- file-processing operations where applicable

Never allow an AI request to wait indefinitely.

---

# 16. Retries

Do not blindly retry every failure.

Retries should only be used when the operation is safe to retry.

Use bounded retries with appropriate delays when necessary.

Do not create retry loops that can amplify failures.

---

# 17. Configuration

Configuration must come from environment variables where appropriate.

Never hardcode:

- passwords
- API keys
- secrets
- environment-specific URLs
- production credentials

Validate required environment variables at startup.

Keep:

`.env`

out of version control.

Keep:

`.env.example`

updated.

---

# 18. Docker

Development and production concerns must remain separate.

Development:

- Docker Compose
- source mounts/watch
- hot reload
- development commands

Production:

- immutable image
- no source-code development mounts
- production command
- non-root user
- minimal runtime dependencies

Do not modify the production image solely to make development convenient.

---

# 19. Docker Networking

Inside Docker Compose:

Use service names for service-to-service communication.

Example:

    http://ollama:11434

Do NOT use:

    http://localhost:11434

from inside another container.

Remember:

`localhost` refers to the current container.

---

# 20. Docker Security

Containers should run as non-root users where practical.

Do not:

- run everything as root unnecessarily
- bake secrets into images
- copy `.env` into images
- install unnecessary packages
- expose unnecessary ports

Use `.dockerignore`.

Keep runtime images as small as reasonably practical.

---

# 21. Database

Use PostgreSQL as the primary relational database.

Use connection pooling.

Do not create a new database connection for every request.

Use migrations for schema changes.

Do not rely on application startup to silently mutate production schemas.

Use transactions where atomicity is required.

Add indexes based on actual query patterns.

---

# 22. Database Naming and Schema

Use consistent naming conventions.

Keep schema changes explicit and reviewable.

Avoid storing data in an unstructured JSON blob when the data is core application data that needs querying.

Use JSON/JSONB where it has a clear purpose.

---

# 23. Logging

Use useful application logs.

Log events such as:

- server startup
- server shutdown
- request failures
- external-service failures
- database failures
- AI latency/errors

Do NOT log:

- passwords
- API keys
- tokens
- complete resumes unnecessarily
- sensitive user data unnecessarily
- complete prompts/responses when not needed

AI workloads should have enough telemetry to diagnose latency and failures.

---

# 24. Security

Treat all external input as untrusted.

Validate:

- request bodies
- query parameters
- path parameters
- uploaded files
- file sizes
- content types

Protect against:

- oversized uploads
- path traversal
- arbitrary file access
- malicious file content
- prompt injection where relevant
- sensitive-data leakage

Never execute uploaded files.

---

# 25. Testing

Every meaningful piece of business logic should be testable independently.

## Unit tests

Use for:

- validation
- parsing
- transformation
- services
- retrieval logic
- business rules

## Integration tests

Use for:

- database interaction
- Ollama integration
- API flows
- vector retrieval
- AI pipeline integration

## AI tests

Create deterministic test inputs where possible.

Test:

- expected structured output
- malformed output
- missing information
- retrieval quality
- grounding behavior
- regression cases

Do not rely exclusively on manually inspecting LLM output.

---
# 26. Code Quality

Prefer:

- small, focused functions
- clear and descriptive names
- explicit types
- single responsibility
- dependency injection where it provides a real benefit
- reusable services and utilities where responsibilities are genuinely shared
- minimal coupling
- simple solutions that fit the existing architecture

Avoid:

- giant controllers
- giant service classes
- hidden global state
- duplicated logic
- unnecessary abstractions
- premature optimization
- premature design patterns
- introducing a design pattern merely to demonstrate the pattern

## Production Code Should Not Be Shaped Around Tests

Production code should be designed around its responsibilities, dependencies,
and application requirements—not around the limitations or convenience of a
particular test framework or mocking API.

When tests need to replace or observe behavior, prefer appropriate test seams
such as:

- dependency injection
- function parameters
- options objects
- interfaces
- constructor dependencies

Do not introduce production-only structures, wrappers, alternate exports,
mutable indirection, or abstractions solely to make a test easier to write.

Before changing production code to accommodate a test:

1. Check whether the dependency can be injected instead.
2. Check whether an existing test seam can be reused.
3. Change the production design only when there is a genuine application or
   architectural reason.

Tests should adapt to reasonable production boundaries rather than dictate them.

# 26.1 Coding Style and Consistency Rules

These rules prevent a common failure mode: individual files being well-written
in isolation while the codebase gradually develops inconsistent patterns.

Apply these rules whenever adding or modifying code.

## 1. Avoid `any`

Do not use `any` as a convenience or escape hatch.

Prefer:

- explicit types
- `unknown` with runtime narrowing
- existing project types
- appropriate generic types

If `any` is genuinely unavoidable at a boundary, such as an incomplete
third-party type, add a short comment explaining why.

An undocumented `any` should be treated as unfinished work.

Do not weaken type safety simply to make an implementation easier.

---

## 2. Follow Established Module Conventions

When adding or modifying a module, follow the conventions already established
for that type of module.

For example, if services generally use named function exports, do not introduce
an object wrapper, default export, class, or namespace for a single service
without a concrete architectural reason.

Before introducing a different pattern:

1. Check how sibling modules are implemented.
2. Determine whether the difference is actually necessary.
3. Prefer an existing dependency-injection or test seam when one already solves
   the problem.
4. If a different pattern is genuinely required, consider whether it should
   become a broader project convention rather than a one-off exception.

Do not refactor unrelated modules solely to make their style identical.

---

## 3. Do Not Shape Production Code Around Tests

Production architecture should be driven by responsibilities and dependencies,
not by the convenience or limitations of a particular test API.

When tests need to replace behavior, prefer an explicit seam such as:

- a function parameter
- an options object
- a dependency-injected interface
- a constructor parameter

Do not change production exports or architecture solely so a mocking API can
attach to a particular function or object.

Tests should work with reasonable production boundaries, not dictate them.

---

## 4. Avoid Introducing Duplicate Logic

Before adding non-trivial logic, search the existing codebase for similar
implementations.

If the same logic already exists, reuse the existing implementation when
appropriate.

If a new implementation would create a third copy of the same meaningful
logic, extract an appropriate shared helper or service before adding it.

Common examples include:

- validation
- error mapping
- retry handling
- timeout handling
- logging wrappers
- data transformation
- common parsing logic

Do not create abstractions merely because two small pieces of code look similar.
Extract shared logic when the responsibility and behavior are genuinely common.

---

## 5. Apply Safety Patterns Consistently

When the project establishes a safety requirement for a category of operation,
apply it consistently to new and modified code.

Examples include:

- timeouts for external/network operations
- validation for untrusted input
- schema validation for LLM output
- bounded retries for retryable operations
- centralized error handling

When adding a new operation of the same category, check the existing safety
pattern before implementing it.

A deviation is acceptable when there is a clear technical reason, but it should
be intentional rather than accidental.

---

## 6. Audit Before Declaring a Pattern Is Isolated

When identifying a consistency problem, search the relevant scope of the
codebase before deciding that it exists in only one file.

For example, when investigating:

- `any`
- export conventions
- duplicated logic
- timeout handling
- error handling
- dependency injection

check the relevant sibling modules first.

Do not fix one occurrence while knowingly introducing the same inconsistent
pattern elsewhere.

However, do not automatically perform a project-wide refactor during an
unrelated feature.

---

## 7. Keep Refactors Scoped

When a consistency issue is discovered:

- fix it when it is directly related to the current change
- avoid unrelated cleanup
- preserve existing behavior
- avoid changing public contracts unnecessarily

If resolving the issue requires a broad project-wide change, identify the scope
and propose it as a separate change rather than silently expanding the current
task.

---

## 8. Verify Changes That Affect Contracts

Whenever a change affects:

- types
- exports
- function signatures
- service interfaces
- repository contracts
- API contracts
- dependency injection
- shared utilities

verify the downstream callers.

Run the appropriate:

- type checking
- tests
- build
- lint
- integration tests where applicable

Do not consider a change complete merely because the modified file looks correct.

---

## 9. Prefer Existing Patterns Before Creating New Ones

Before introducing a new abstraction, helper, pattern, or dependency:

1. Search the codebase for an existing solution.
2. Check whether the existing solution can reasonably be reused.
3. Prefer the simplest approach that fits the existing architecture.

Do not introduce a new pattern merely because it is theoretically cleaner.

The goal is a coherent codebase, not maximum abstraction.

---

## 10. Consistency Must Not Override Good Architecture

Consistency is a guideline, not a reason to preserve a bad design.

A different pattern may be appropriate when:

- the responsibility is genuinely different
- the existing pattern does not fit
- a framework or library requires a different boundary
- there is a clear architectural benefit

When introducing such a deviation, keep it intentional and document the reason
when the reason would not be obvious from the code.

---

## 11. Existing Code vs. New Code

These rules primarily govern new code and code being actively modified.

Do not perform large-scale style rewrites simply because older code does not
follow the preferred convention.

When modifying an existing file:

1. Preserve working behavior.
2. Follow the established convention where practical.
3. Fix directly relevant inconsistencies when doing so is low-risk.
4. Avoid unrelated cleanup unless explicitly requested.

---

## 12. Project-Wide Convention Changes

If applying a consistency rule would require changing many files, do not silently
bundle that change into a feature implementation.

First:

1. Identify the affected scope.
2. Explain the proposed convention.
3. Explain why the change is beneficial.
4. Get approval before performing a broad refactor.

This prevents a small feature from unexpectedly becoming a project-wide
architecture change.

---

# 27. TypeScript

Use strict TypeScript settings.

Avoid:

```ts
any
```

unless there is a justified boundary where it is unavoidable.

Prefer:

- explicit types
- interfaces/types for application contracts
- runtime validation for external data

Remember:

TypeScript types disappear at runtime.

External data still needs runtime validation.

---

# 28. ESM

The project uses ESM.

Maintain the existing ESM configuration.

Do not convert the project to CommonJS unless explicitly requested.

Follow the project's established import conventions.

---

# 29. API Contracts

When services or modules communicate, define clear contracts.

For AI requests, distinguish:

- request input
- model invocation
- model response
- validated application output

Do not pass arbitrary objects through multiple layers without validation.

---

# 30. Performance

Do not optimize prematurely.

Measure before optimizing.

Potential future concerns:

- LLM latency
- model loading
- token generation
- PDF extraction
- embedding generation
- vector search
- database queries
- concurrent AI requests

If performance becomes a problem, identify the bottleneck first.

---

# 31. Streaming

The initial Ollama integration uses:

    stream: false

Do not change this automatically.

Streaming should be introduced deliberately after the basic request/response flow is understood.

When streaming is introduced, ensure the API contract and error handling properly support partial responses.

---

# 32. Git

Do not commit:

- `.env`
- secrets
- credentials
- generated model files
- database volumes
- temporary uploaded files
- build output when the project excludes it
- local IDE files

Keep `.gitignore` updated.

Do not modify unrelated files.

Do not rewrite history unless explicitly requested.

---

# 33. File Changes

Before modifying a file:

1. Inspect the existing implementation.
2. Preserve working behavior.
3. Make the smallest necessary change.
4. Avoid unrelated refactoring.

Do not replace working code merely because another implementation looks cleaner.

---

# 34. Verification

After implementation, verify the change.

Depending on the change, run:

- type checking
- unit tests
- integration tests
- build
- Docker Compose checks
- API requests
- health checks

Do not claim a feature works without verifying it.

If something cannot be verified, state that clearly.

---

# 35. Documentation

Keep documentation synchronized with the implementation.

Update documentation when:

- architecture changes
- environment variables change
- setup commands change
- services are added/removed
- development workflow changes
- API contracts change

Do not create duplicate documentation unless there is a clear reason.

---

# 36. Phase Boundaries

The project should progress in controlled phases.

Phase status (COMPLETE / NEXT / pending) is tracked in a single place:
the "Current Status" and "Current Next Step" sections of `PLAN.md`.

Do not duplicate phase-completion status here — read it from `PLAN.md`
before starting work, and update it only there. Duplicating status in
two files is how they silently drift out of sync.

Do not implement later phases prematurely.

While implementing LangChain:

DO:
- model integration
- prompts
- basic chains
- comparison with fetch

DO NOT:
- implement RAG
- implement pgvector
- implement embeddings
- implement agents
- implement full resume analysis

---

# 37. Current Next Task

See `PLAN.md` → "Current Next Step" for the active task and its numbered
requirements. Do not copy that task list here — read it fresh from
`PLAN.md` each time, since that is the only place it is kept current.

After the current task's implementation works, STOP and report:

- files changed
- dependencies added
- architecture change
- verification performed
- any issues
- what the next phase should be

---

# 38. Agent Communication Style

When implementing a task:

First explain briefly:

- what will change
- why it is needed
- what will NOT change

Then implement.

After implementation:

- summarize changes
- show verification
- mention any assumptions
- mention anything that could not be verified

Do not overwhelm the user with unrelated implementation details.

---

# 39. Important Principle

This is both a working project and a learning project.

Do not hide architectural decisions behind libraries.

Whenever introducing an important technology, the implementation should make it possible to understand:

- what problem it solves
- what it replaces
- what abstraction it provides
- what tradeoffs it introduces
- whether it is actually necessary

The goal is not:

"Use as many AI technologies as possible."

The goal is:

"Build a realistic AI backend while understanding every important component."

---

# Final Rule

Always follow:

PLAN.md
        +
AGENTS.md
        +
existing working code

Do not invent a new architecture without discussing it.

Do not introduce Python, RAG, agents, vector databases, or other major components early simply because they are common AI technologies.

Implement the smallest correct step, verify it, and then continue.
