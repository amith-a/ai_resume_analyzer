import { describe, it } from "node:test";
import assert from "node:assert";
import type pg from "pg";
import {
  insertDocument,
  insertDocumentChunks,
  findDocumentById,
  findDocumentChunksByDocumentId,
  deleteDocumentById,
  findChunksByDocumentIdOrderedBySimilarity,
} from "../../src/repositories/document.repository.js";
import { DEFAULT_VECTOR_DIMENSION } from "../../src/utils/vector.utils.js";

function createMockVector(hotIndex: number, length: number = DEFAULT_VECTOR_DIMENSION): number[] {
  const vec = new Array(length).fill(0.01);
  vec[hotIndex] = 1.0;
  return vec;
}

describe("Document Repository Unit Tests", () => {
  describe("insertDocument", () => {
    it("1. inserts a valid document and returns DocumentRecord", async () => {
      const mockDocRow = {
        id: "11111111-1111-1111-1111-111111111111",
        title: "Test Resume - Jane Doe",
        file_path: "/uploads/resume.pdf",
        document_type: "resume",
        raw_text: "Full text content",
        metadata: { candidate: "Jane Doe" },
        created_at: new Date(),
        updated_at: new Date(),
      };

      let executedQuery = "";
      let executedParams: unknown[] = [];

      const mockQueryable: pg.Pool = {
        query: async (queryText: string, params?: unknown[]) => {
          executedQuery = queryText;
          executedParams = params ?? [];
          return { rows: [mockDocRow], rowCount: 1 } as unknown as pg.QueryResult;
        },
      } as unknown as pg.Pool;

      const doc = await insertDocument(
        {
          title: "Test Resume - Jane Doe",
          document_type: "resume",
          file_path: "/uploads/resume.pdf",
          raw_text: "Full text content",
          metadata: { candidate: "Jane Doe" },
        },
        mockQueryable,
      );

      assert.equal(doc.id, mockDocRow.id);
      assert.equal(doc.title, "Test Resume - Jane Doe");
      assert.ok(executedQuery.includes("INSERT INTO documents"));
      assert.equal(executedParams[0], "Test Resume - Jane Doe");
      assert.equal(executedParams[1], "/uploads/resume.pdf");
      assert.equal(executedParams[2], "resume");
      assert.equal(executedParams[3], "Full text content");
      assert.equal(executedParams[4], JSON.stringify({ candidate: "Jane Doe" }));
    });

    it("2. rejects invalid or empty title with TypeError", async () => {
      await assert.rejects(
        async () => {
          await insertDocument({
            title: "   ",
            document_type: "resume",
          });
        },
        { name: "TypeError", message: /Document title must be a non-empty string/ },
      );
    });

    it("3. rejects invalid or empty document_type with TypeError", async () => {
      await assert.rejects(
        async () => {
          await insertDocument({
            title: "Valid Title",
            document_type: "",
          });
        },
        { name: "TypeError", message: /Document type must be a non-empty string/ },
      );
    });
  });

  describe("insertDocumentChunks", () => {
    it("4. batch inserts chunks with vectors and returns DocumentChunkRecords with parsed vectors", async () => {
      const mockVector = createMockVector(0);
      const mockReturnedRow = {
        id: "22222222-2222-2222-2222-222222222222",
        document_id: "11111111-1111-1111-1111-111111111111",
        chunk_index: 0,
        content: "First chunk text",
        metadata: { section: "skills" },
        embedding: `[${mockVector.join(",")}]`,
        created_at: new Date(),
      };

      let executedQuery = "";
      let executedParams: unknown[] = [];

      const mockQueryable: pg.Pool = {
        query: async (queryText: string, params?: unknown[]) => {
          executedQuery = queryText;
          executedParams = params ?? [];
          return { rows: [mockReturnedRow], rowCount: 1 } as unknown as pg.QueryResult;
        },
      } as unknown as pg.Pool;

      const storedChunks = await insertDocumentChunks(
        [
          {
            document_id: "11111111-1111-1111-1111-111111111111",
            chunk_index: 0,
            content: "First chunk text",
            metadata: { section: "skills" },
            embedding: mockVector,
          },
        ],
        mockQueryable,
      );

      assert.equal(storedChunks.length, 1);
      assert.equal(storedChunks[0].id, mockReturnedRow.id);
      assert.equal(storedChunks[0].chunk_index, 0);
      assert.equal(storedChunks[0].content, "First chunk text");
      assert.ok(Array.isArray(storedChunks[0].embedding));
      assert.equal(storedChunks[0].embedding.length, 768);
      assert.equal(storedChunks[0].embedding[0], 1.0);

      assert.ok(executedQuery.includes("INSERT INTO document_chunks"));
      assert.ok(executedQuery.includes("$5::vector"));
      assert.equal(executedParams[0], "11111111-1111-1111-1111-111111111111");
      assert.equal(executedParams[1], 0);
      assert.equal(executedParams[2], "First chunk text");
      assert.equal(executedParams[3], JSON.stringify({ section: "skills" }));
      assert.ok(
        typeof executedParams[4] === "string" && (executedParams[4] as string).startsWith("["),
      );
    });

    it("5. returns empty array if input chunks array is empty", async () => {
      const result = await insertDocumentChunks([]);
      assert.deepEqual(result, []);
    });

    it("6. validates chunk fields and throws on invalid content or indices", async () => {
      await assert.rejects(
        async () => {
          await insertDocumentChunks([
            {
              document_id: "doc-1",
              chunk_index: -1,
              content: "Valid text",
            },
          ]);
        },
        { name: "TypeError", message: /invalid chunk_index/ },
      );

      await assert.rejects(
        async () => {
          await insertDocumentChunks([
            {
              document_id: "doc-1",
              chunk_index: 0,
              content: "   ",
            },
          ]);
        },
        { name: "TypeError", message: /empty or invalid content/ },
      );
    });
  });

  describe("findDocumentById, findDocumentChunksByDocumentId, and deleteDocumentById", () => {
    it("7. findDocumentById returns document row or null", async () => {
      const mockDocRow = {
        id: "doc-1",
        title: "Fetched Doc",
        file_path: null,
        document_type: "resume",
        raw_text: "Text",
        metadata: {},
        created_at: new Date(),
        updated_at: new Date(),
      };

      const mockPool: pg.Pool = {
        query: async (_: string, params?: unknown[]) => {
          if (params?.[0] === "doc-1") {
            return { rows: [mockDocRow], rowCount: 1 } as unknown as pg.QueryResult;
          }
          return { rows: [], rowCount: 0 } as unknown as pg.QueryResult;
        },
      } as unknown as pg.Pool;

      const found = await findDocumentById("doc-1", mockPool);
      assert.equal(found?.id, "doc-1");

      const notFound = await findDocumentById("doc-nonexistent", mockPool);
      assert.equal(notFound, null);
    });

    it("8. findDocumentChunksByDocumentId returns ordered chunks with parsed vector", async () => {
      const vec = createMockVector(5);
      const mockChunks = [
        {
          id: "c-0",
          document_id: "doc-1",
          chunk_index: 0,
          content: "Chunk 0",
          metadata: {},
          embedding: `[${vec.join(",")}]`,
          created_at: new Date(),
        },
      ];

      const mockPool: pg.Pool = {
        query: async (q: string) => {
          assert.ok(q.includes("ORDER BY chunk_index ASC"));
          return { rows: mockChunks, rowCount: 1 } as unknown as pg.QueryResult;
        },
      } as unknown as pg.Pool;

      const chunks = await findDocumentChunksByDocumentId("doc-1", mockPool);
      assert.equal(chunks.length, 1);
      assert.equal(chunks[0].chunk_index, 0);
      assert.ok(Array.isArray(chunks[0].embedding));
      assert.equal(chunks[0].embedding[5], 1.0);
    });

    it("9. deleteDocumentById executes DELETE query and returns boolean result", async () => {
      let deletedId: unknown = null;

      const mockPool: pg.Pool = {
        query: async (_: string, params?: unknown[]) => {
          deletedId = params?.[0];
          return { rows: [], rowCount: 1 } as unknown as pg.QueryResult;
        },
      } as unknown as pg.Pool;

      const result = await deleteDocumentById("doc-to-delete", mockPool);
      assert.equal(result, true);
      assert.equal(deletedId, "doc-to-delete");
    });
  });

  describe("findChunksByDocumentIdOrderedBySimilarity", () => {
    it("10. executes cosine distance query scoped by document_id and returns ordered chunks with distance", async () => {
      const vec0 = createMockVector(0);
      const vec1 = createMockVector(1);
      const queryVec = createMockVector(0);

      const mockRows = [
        {
          id: "chunk-0",
          document_id: "doc-123",
          chunk_index: 0,
          content: "Nearest chunk text",
          metadata: { section: "experience" },
          embedding: `[${vec0.join(",")}]`,
          distance: "0.000000",
          created_at: new Date(),
        },
        {
          id: "chunk-1",
          document_id: "doc-123",
          chunk_index: 1,
          content: "Second chunk text",
          metadata: { section: "skills" },
          embedding: `[${vec1.join(",")}]`,
          distance: 0.15,
          created_at: new Date(),
        },
      ];

      let executedQuery = "";
      let executedParams: unknown[] = [];

      const mockPool: pg.Pool = {
        query: async (q: string, params?: unknown[]) => {
          executedQuery = q;
          executedParams = params ?? [];
          return { rows: mockRows, rowCount: 2 } as unknown as pg.QueryResult;
        },
      } as unknown as pg.Pool;

      const results = await findChunksByDocumentIdOrderedBySimilarity(
        "doc-123",
        queryVec,
        2,
        undefined,
        undefined,
        mockPool,
      );

      assert.equal(results.length, 2);
      assert.equal(results[0].id, "chunk-0");
      assert.equal(results[0].distance, 0.0);
      assert.equal(results[1].id, "chunk-1");
      assert.equal(results[1].distance, 0.15);
      assert.equal(results[0].embedding?.length, 768);

      assert.ok(executedQuery.includes("WHERE document_id = $1"));
      assert.ok(executedQuery.includes("ORDER BY embedding <=> $2::vector ASC"));
      assert.ok(executedQuery.includes("LIMIT $3"));
      assert.equal(executedParams[0], "doc-123");
      assert.ok(
        typeof executedParams[1] === "string" && (executedParams[1] as string).startsWith("["),
      );
      assert.equal(executedParams[2], 2);
    });

    it("11. rejects empty or invalid documentId with TypeError", async () => {
      const queryVec = createMockVector(0);
      await assert.rejects(
        async () => {
          await findChunksByDocumentIdOrderedBySimilarity("", queryVec, 5);
        },
        { name: "TypeError", message: /documentId must be a non-empty string/ },
      );
    });

    it("12. validates query vector dimension and throws on invalid dimension", async () => {
      await assert.rejects(
        async () => {
          await findChunksByDocumentIdOrderedBySimilarity("doc-123", [0.1, 0.2], 5);
        },
        { message: /Vector dimension mismatch/ },
      );
    });

    it("13. rejects invalid topK values (0, negative, non-integer, NaN, non-number) with RangeError", async () => {
      const queryVec = createMockVector(0);

      // topK = 0
      await assert.rejects(
        async () => {
          await findChunksByDocumentIdOrderedBySimilarity("doc-123", queryVec, 0);
        },
        { name: "RangeError", message: /topK must be a positive integer/ },
      );

      // topK = -3
      await assert.rejects(
        async () => {
          await findChunksByDocumentIdOrderedBySimilarity("doc-123", queryVec, -3);
        },
        { name: "RangeError", message: /topK must be a positive integer/ },
      );

      // topK = 2.5 (non-integer float)
      await assert.rejects(
        async () => {
          await findChunksByDocumentIdOrderedBySimilarity("doc-123", queryVec, 2.5);
        },
        { name: "RangeError", message: /topK must be a positive integer/ },
      );

      // topK = NaN
      await assert.rejects(
        async () => {
          await findChunksByDocumentIdOrderedBySimilarity("doc-123", queryVec, NaN);
        },
        { name: "RangeError", message: /topK must be a positive integer/ },
      );

      // topK = "5" (non-number string cast)
      await assert.rejects(
        async () => {
          await findChunksByDocumentIdOrderedBySimilarity(
            "doc-123",
            queryVec,
            "5" as unknown as number,
          );
        },
        { name: "RangeError", message: /topK must be a positive integer/ },
      );
    });

    it("14. executes query with AND (embedding <=> $2::vector) <= $4 when maxDistanceThreshold is provided", async () => {
      const vec0 = createMockVector(0);
      const queryVec = createMockVector(0);

      const mockRows = [
        {
          id: "chunk-0",
          document_id: "doc-123",
          chunk_index: 0,
          content: "Qualifying chunk text",
          metadata: { section: "experience" },
          embedding: `[${vec0.join(",")}]`,
          distance: "0.050000",
          created_at: new Date(),
        },
      ];

      let executedQuery = "";
      let executedParams: unknown[] = [];

      const mockPool: pg.Pool = {
        query: async (q: string, params?: unknown[]) => {
          executedQuery = q;
          executedParams = params ?? [];
          return { rows: mockRows, rowCount: 1 } as unknown as pg.QueryResult;
        },
      } as unknown as pg.Pool;

      const results = await findChunksByDocumentIdOrderedBySimilarity(
        "doc-123",
        queryVec,
        5,
        0.3,
        undefined,
        mockPool,
      );

      assert.equal(results.length, 1);
      assert.equal(results[0].id, "chunk-0");
      assert.equal(results[0].distance, 0.05);

      assert.ok(executedQuery.includes("WHERE document_id = $1"));
      assert.ok(executedQuery.includes("AND (embedding <=> $2::vector) <= $4"));
      assert.ok(executedQuery.includes("ORDER BY embedding <=> $2::vector ASC"));
      assert.ok(executedQuery.includes("LIMIT $3"));
      assert.equal(executedParams[0], "doc-123");
      assert.ok(
        typeof executedParams[1] === "string" && (executedParams[1] as string).startsWith("["),
      );
      assert.equal(executedParams[2], 5);
      assert.equal(executedParams[3], 0.3);
    });

    it("15. rejects invalid maxDistanceThreshold values (negative, NaN, Infinity, non-number) with RangeError", async () => {
      const queryVec = createMockVector(0);

      // negative threshold
      await assert.rejects(
        async () => {
          await findChunksByDocumentIdOrderedBySimilarity("doc-123", queryVec, 5, -0.01);
        },
        {
          name: "RangeError",
          message: /maxDistanceThreshold must be a non-negative finite number/,
        },
      );

      // NaN
      await assert.rejects(
        async () => {
          await findChunksByDocumentIdOrderedBySimilarity("doc-123", queryVec, 5, NaN);
        },
        {
          name: "RangeError",
          message: /maxDistanceThreshold must be a non-negative finite number/,
        },
      );

      // Infinity
      await assert.rejects(
        async () => {
          await findChunksByDocumentIdOrderedBySimilarity("doc-123", queryVec, 5, Infinity);
        },
        {
          name: "RangeError",
          message: /maxDistanceThreshold must be a non-negative finite number/,
        },
      );

      // string
      await assert.rejects(
        async () => {
          await findChunksByDocumentIdOrderedBySimilarity(
            "doc-123",
            queryVec,
            5,
            "0.3" as unknown as number,
          );
        },
        {
          name: "RangeError",
          message: /maxDistanceThreshold must be a non-negative finite number/,
        },
      );
    });

    it("16. executes query with AND metadata @> $4::jsonb when metadataFilter is provided without threshold", async () => {
      const vec0 = createMockVector(0);
      const queryVec = createMockVector(0);

      const mockRows = [
        {
          id: "chunk-0",
          document_id: "doc-123",
          chunk_index: 0,
          content: "Experience chunk text",
          metadata: { section: "experience" },
          embedding: `[${vec0.join(",")}]`,
          distance: "0.050000",
          created_at: new Date(),
        },
      ];

      let executedQuery = "";
      let executedParams: unknown[] = [];

      const mockPool: pg.Pool = {
        query: async (q: string, params?: unknown[]) => {
          executedQuery = q;
          executedParams = params ?? [];
          return { rows: mockRows, rowCount: 1 } as unknown as pg.QueryResult;
        },
      } as unknown as pg.Pool;

      const results = await findChunksByDocumentIdOrderedBySimilarity(
        "doc-123",
        queryVec,
        5,
        undefined,
        { section: "experience" },
        mockPool,
      );

      assert.equal(results.length, 1);
      assert.equal(results[0].id, "chunk-0");

      assert.ok(executedQuery.includes("WHERE document_id = $1"));
      assert.ok(executedQuery.includes("AND metadata @> $4::jsonb"));
      assert.ok(executedQuery.includes("ORDER BY embedding <=> $2::vector ASC"));
      assert.ok(executedQuery.includes("LIMIT $3"));
      assert.equal(executedParams[0], "doc-123");
      assert.equal(executedParams[2], 5);
      assert.equal(executedParams[3], JSON.stringify({ section: "experience" }));
    });

    it("17. executes query with both threshold and metadata filters properly parameterized", async () => {
      const queryVec = createMockVector(0);

      let executedQuery = "";
      let executedParams: unknown[] = [];

      const mockPool: pg.Pool = {
        query: async (q: string, params?: unknown[]) => {
          executedQuery = q;
          executedParams = params ?? [];
          return { rows: [], rowCount: 0 } as unknown as pg.QueryResult;
        },
      } as unknown as pg.Pool;

      await findChunksByDocumentIdOrderedBySimilarity(
        "doc-123",
        queryVec,
        3,
        0.25,
        { section: "skills", level: "senior" },
        mockPool,
      );

      assert.ok(executedQuery.includes("WHERE document_id = $1"));
      assert.ok(executedQuery.includes("AND (embedding <=> $2::vector) <= $4"));
      assert.ok(executedQuery.includes("AND metadata @> $5::jsonb"));
      assert.ok(executedQuery.includes("LIMIT $3"));
      assert.equal(executedParams[0], "doc-123");
      assert.equal(executedParams[2], 3);
      assert.equal(executedParams[3], 0.25);
      assert.equal(executedParams[4], JSON.stringify({ section: "skills", level: "senior" }));
    });

    it("18. rejects invalid metadataFilter (array, primitive) with TypeError", async () => {
      const queryVec = createMockVector(0);

      // array
      await assert.rejects(
        async () => {
          await findChunksByDocumentIdOrderedBySimilarity("doc-123", queryVec, 5, undefined, [
            "section",
            "skills",
          ] as unknown as Record<string, unknown>);
        },
        { name: "TypeError", message: /metadataFilter must be a valid object/ },
      );

      // string primitive
      await assert.rejects(
        async () => {
          await findChunksByDocumentIdOrderedBySimilarity(
            "doc-123",
            queryVec,
            5,
            undefined,
            "section" as unknown as Record<string, unknown>,
          );
        },
        { name: "TypeError", message: /metadataFilter must be a valid object/ },
      );
    });
  });
});
