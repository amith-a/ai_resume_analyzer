/**
 * Golden Evaluation Cases Fixture
 *
 * Deterministic test fixtures reusing the canonical resume data from tests/chunker.test.ts.
 * Provides stable evaluation baselines for evaluateRetrieval() and evaluateAnswer().
 */

import type {
  RetrievalEvaluationCase,
  RetrievalChunkInput,
} from "../../src/services/retrieval-evaluation.service.js";
import type { AnswerEvaluationCase } from "../../src/services/answer-evaluation.service.js";

/**
 * Canonical resume chunks based on the established resume fixture in tests/chunker.test.ts.
 */
export const CANONICAL_CHUNKS = {
  summary: {
    content:
      "Jane Doe\nStaff Backend Engineer with 10+ years of experience in high-throughput distributed systems.",
  },
  acmeCorp: {
    content:
      "Acme Corp — Staff Engineer (2020 - Present)\nArchitected core asynchronous microservices using TypeScript, Node.js, and Kafka processing over 100 million events daily.\nDesigned partitioned PostgreSQL databases with connection pooling and optimized query plans, reducing p99 latency by 45%.\nMentored junior and senior engineers, established strict CI/CD pipelines, and conducted architectural review sessions across five engineering teams.",
  },
  betaTech: {
    content:
      "Beta Tech — Senior Software Engineer (2016 - 2020)\nBuilt scalable REST APIs and streaming data ingestion pipelines utilizing Go, Docker, and Kubernetes.\nLed cloud migration from on-premise infrastructure to AWS, achieving 99.99% service availability.\nImplemented automated integration testing and distributed tracing with OpenTelemetry.",
  },
  education: {
    content:
      "Stanford University — B.S. in Computer Science (2010 - 2014)\nDean's Honor List, focus on Distributed Systems and Operating Systems.",
  },
  projectsSkills: {
    content:
      "High-Throughput Streamer: Distributed real-time stream consumer written in Go and Node.js.\nTechnologies: TypeScript, Node.js, Go, PostgreSQL, Kafka, Docker, Kubernetes, AWS, Redis, GraphQL.",
  },
} as const satisfies Record<string, RetrievalChunkInput>;

export interface GoldenRetrievalCase extends RetrievalEvaluationCase {
  expectedPassed: boolean;
  retrievedChunks: RetrievalChunkInput[];
}

export interface GoldenAnswerCase extends AnswerEvaluationCase {
  expectedPassed: boolean;
}

/**
 * 6 Golden Retrieval Evaluation Cases
 */
export const goldenRetrievalCases: GoldenRetrievalCase[] = [
  {
    name: "retrieval-nodejs-skill",
    query: "Does the candidate have Node.js and TypeScript experience?",
    expectedTerms: ["Node.js", "TypeScript"],
    retrievedChunks: [CANONICAL_CHUNKS.acmeCorp],
    expectedPassed: true,
  },
  {
    name: "retrieval-aws-cloud",
    query: "Does the candidate have AWS cloud migration experience?",
    expectedTerms: ["AWS", "cloud migration"],
    retrievedChunks: [CANONICAL_CHUNKS.betaTech],
    expectedPassed: true,
  },
  {
    name: "retrieval-role-experience",
    query: "What is the candidate's staff backend engineering experience?",
    expectedTerms: ["Staff Backend Engineer", "10+ years"],
    retrievedChunks: [CANONICAL_CHUNKS.summary],
    expectedPassed: true,
  },
  {
    name: "retrieval-missing-python",
    query: "Does the candidate have Python or Django experience?",
    expectedTerms: ["Python", "Django"],
    retrievedChunks: [CANONICAL_CHUNKS.acmeCorp, CANONICAL_CHUNKS.betaTech],
    expectedPassed: false,
  },
  {
    name: "retrieval-multiword-phrase",
    query: "What database architecture experience does the candidate have?",
    expectedTerms: ["PostgreSQL databases", "connection pooling"],
    retrievedChunks: [CANONICAL_CHUNKS.acmeCorp],
    expectedPassed: true,
  },
  {
    name: "retrieval-technical-education-numbers",
    query: "What was the candidate's degree, university, and graduation year?",
    expectedTerms: ["Stanford University", "Computer Science", "2014"],
    retrievedChunks: [CANONICAL_CHUNKS.education],
    expectedPassed: true,
  },
];

/**
 * 6 Golden Answer Evaluation Cases
 */
export const goldenAnswerCases: GoldenAnswerCase[] = [
  {
    name: "answer-supported-acme-technologies",
    context: CANONICAL_CHUNKS.acmeCorp.content,
    answer:
      "The candidate architected asynchronous microservices using TypeScript, Node.js, and Kafka at Acme Corp.",
    expectedPassed: true,
  },
  {
    name: "answer-mostly-supported-beta-tech",
    context: CANONICAL_CHUNKS.betaTech.content,
    answer: "The candidate built REST APIs using Go and led cloud migration to AWS.",
    expectedPassed: true,
  },
  {
    name: "answer-unsupported-python-django",
    context: CANONICAL_CHUNKS.acmeCorp.content,
    answer:
      "The candidate has extensive production experience building web applications with Python, Django, Ruby on Rails, and PHP.",
    expectedPassed: false,
  },
  {
    name: "answer-empty-context",
    context: "",
    answer: "The candidate worked as a Staff Engineer at Acme Corp.",
    expectedPassed: false,
  },
  {
    name: "answer-technical-numbers-stanford",
    context: CANONICAL_CHUNKS.education.content,
    answer:
      "The candidate studied Computer Science at Stanford University from 2010 to 2014.",
    expectedPassed: true,
  },
  {
    name: "answer-unsupported-claim-diluted",
    context: CANONICAL_CHUNKS.betaTech.content,
    answer:
      "The candidate led cloud migration to AWS but spent most time developing mobile applications in Swift, SwiftUI, and Objective-C.",
    expectedPassed: false,
  },
];
