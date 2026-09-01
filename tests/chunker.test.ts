import { describe, it } from "node:test";
import assert from "node:assert";
import { chunkText } from "../src/utils/chunker.util.js";

describe("chunkText Utility Unit Tests", () => {
  const sampleShortText = "Jane Doe\nStaff Backend Engineer\nSkills: TypeScript, PostgreSQL, Docker";

  const sampleLongText = `Jane Doe
Staff Backend Engineer with 10+ years of experience in high-throughput distributed systems.

PROFESSIONAL EXPERIENCE
Acme Corp — Staff Engineer (2020 - Present)
Architected core asynchronous microservices using TypeScript, Node.js, and Kafka processing over 100 million events daily.
Designed partitioned PostgreSQL databases with connection pooling and optimized query plans, reducing p99 latency by 45%.
Mentored junior and senior engineers, established strict CI/CD pipelines, and conducted architectural review sessions across five engineering teams.

Beta Tech — Senior Software Engineer (2016 - 2020)
Built scalable REST APIs and streaming data ingestion pipelines utilizing Go, Docker, and Kubernetes.
Led cloud migration from on-premise infrastructure to AWS, achieving 99.99% service availability.
Implemented automated integration testing and distributed tracing with OpenTelemetry.

EDUCATION
Stanford University — B.S. in Computer Science (2010 - 2014)
Dean's Honor List, focus on Distributed Systems and Operating Systems.

PROJECTS & SKILLS
High-Throughput Streamer: Distributed real-time stream consumer written in Go and Node.js.
Technologies: TypeScript, Node.js, Go, PostgreSQL, Kafka, Docker, Kubernetes, AWS, Redis, GraphQL.`;

  it("1. short text produces one chunk", () => {
    const chunks = chunkText(sampleShortText, { chunkSize: 200, chunkOverlap: 50 });

    assert.equal(chunks.length, 1);
    assert.equal(chunks[0].chunkIndex, 0);
    assert.equal(chunks[0].content, sampleShortText);
  });

  it("2. long text produces multiple chunks", () => {
    const chunks = chunkText(sampleLongText, { chunkSize: 300, chunkOverlap: 60 });

    assert.ok(chunks.length > 1, `Expected multiple chunks, received ${chunks.length}`);
    for (const chunk of chunks) {
      assert.ok(chunk.content.length > 0, "Chunk content must not be empty");
      assert.ok(typeof chunk.chunkIndex === "number", "Chunk must have a numeric chunkIndex");
    }
  });

  it("3. chunk indexes preserve ordering", () => {
    const chunks = chunkText(sampleLongText, { chunkSize: 250, chunkOverlap: 50 });

    assert.ok(chunks.length >= 3, "Expected at least 3 chunks");
    for (let i = 0; i < chunks.length; i++) {
      assert.equal(chunks[i].chunkIndex, i, `Chunk at index ${i} must have chunkIndex === ${i}`);
    }
  });

  it("4. configured overlap is applied correctly", () => {
    const text = "Alpha Bravo Charlie Delta Echo Foxtrot Golf Hotel India Juliet Kilo Lima Mike";
    const chunkSize = 35;
    const chunkOverlap = 15;

    const chunks = chunkText(text, { chunkSize, chunkOverlap });

    assert.ok(chunks.length >= 2, "Expected multiple chunks to verify overlap");

    // Verify that the end of chunk 0 appears in the beginning of chunk 1
    for (let i = 0; i < chunks.length - 1; i++) {
      const currentWords = chunks[i].content.split(" ");
      const nextWords = chunks[i + 1].content.split(" ");

      // At least one word from the end of current chunk should exist in the next chunk
      const lastWord = currentWords[currentWords.length - 1];
      const hasWordOverlap = nextWords.includes(lastWord) || chunks[i + 1].content.includes(lastWord);
      assert.ok(
        hasWordOverlap,
        `Expected overlap between chunk ${i} and chunk ${i + 1}`
      );
    }
  });

  it("5. empty input is handled correctly", () => {
    assert.deepEqual(chunkText(""), []);
    assert.deepEqual(chunkText("   \n\t  \n  "), []);
    assert.deepEqual(chunkText(null), []);
    assert.deepEqual(chunkText(undefined), []);
  });

  it("6. text is not unexpectedly lost", () => {
    const chunks = chunkText(sampleLongText, { chunkSize: 200, chunkOverlap: 50 });

    // Every distinct paragraph keyword in the original text must be present in at least one chunk
    const testKeywords = [
      "Jane Doe",
      "Staff Backend Engineer",
      "Acme Corp",
      "Kafka",
      "Beta Tech",
      "Kubernetes",
      "Stanford University",
      "High-Throughput Streamer",
    ];

    for (const keyword of testKeywords) {
      const found = chunks.some((c) => c.content.includes(keyword));
      assert.ok(found, `Expected keyword "${keyword}" to be present across chunks`);
    }
  });

  it("7. changing chunk size changes chunk boundaries", () => {
    const smallChunks = chunkText(sampleLongText, { chunkSize: 150, chunkOverlap: 30 });
    const largeChunks = chunkText(sampleLongText, { chunkSize: 600, chunkOverlap: 100 });

    assert.ok(
      smallChunks.length > largeChunks.length,
      `Smaller chunk size (${smallChunks.length}) should produce more chunks than larger chunk size (${largeChunks.length})`
    );
    assert.notEqual(smallChunks[0].content, largeChunks[0].content);
  });

  it("8. changing overlap changes the resulting chunks", () => {
    const lowOverlapChunks = chunkText(sampleLongText, { chunkSize: 300, chunkOverlap: 20 });
    const highOverlapChunks = chunkText(sampleLongText, { chunkSize: 300, chunkOverlap: 120 });

    // Higher overlap means smaller step forward, resulting in more or differently positioned chunks
    assert.ok(
      highOverlapChunks.length >= lowOverlapChunks.length,
      "Higher overlap should produce equal or greater number of chunks"
    );
    assert.notDeepEqual(lowOverlapChunks, highOverlapChunks);
  });

  it("9. validates option boundaries and throws on invalid chunkSize/chunkOverlap", () => {
    assert.throws(() => chunkText(sampleShortText, { chunkSize: 0 }), RangeError);
    assert.throws(() => chunkText(sampleShortText, { chunkSize: -10 }), RangeError);
    assert.throws(() => chunkText(sampleShortText, { chunkSize: 100, chunkOverlap: 100 }), RangeError);
    assert.throws(() => chunkText(sampleShortText, { chunkSize: 100, chunkOverlap: 150 }), RangeError);
    assert.throws(() => chunkText(sampleShortText, { chunkSize: 100, chunkOverlap: -5 }), RangeError);
  });
});
