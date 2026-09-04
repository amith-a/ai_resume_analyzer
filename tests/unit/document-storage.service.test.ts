import { describe, it } from "node:test";
import assert from "node:assert";
import type pg from "pg";
import {
  getDocumentById,
  getDocumentChunks,
  deleteDocument,
  storeDocumentWithChunks,
} from "../../src/services/document-storage.service.js";
import { DEFAULT_VECTOR_DIMENSION } from "../../src/utils/vector.utils.js";
import type { EmbeddingsClient } from "../../src/services/embedding.service.js";

function createMockVector(hotIndex: number, length: number = DEFAULT_VECTOR_DIMENSION): number[] {
  const vec = new Array(length).fill(0.01);
  vec[hotIndex] = 1.0;
  return vec;
}

describe("Document Storage Service Unit Tests", () => {
  describe("storeDocumentWithChunks orchestration & transactions", () => {
    it("1. orchestrates chunking, embedding generation, and transactional repository storage", async () => {
      const mockDocId = "doc-uuid-1234";
      const sampleText =
        "Paragraph 1 with TypeScript details.\n\nParagraph 2 with PostgreSQL details.";

      const mockDocRow = {
        id: mockDocId,
        title: "Test Ingest",
        file_path: null,
        document_type: "resume",
        raw_text: sampleText,
        metadata: {},
        created_at: new Date(),
        updated_at: new Date(),
      };

      let clientReleased = false;
      const queryHistory: string[] = [];

      const mockClient: pg.PoolClient = {
        query: async (queryText: string) => {
          queryHistory.push(queryText.trim());

          if (queryText.includes("INSERT INTO documents")) {
            return { rows: [mockDocRow], rowCount: 1 } as unknown as pg.QueryResult;
          }

          if (queryText.includes("INSERT INTO document_chunks")) {
            return {
              rows: [
                {
                  id: "chunk-1",
                  document_id: mockDocId,
                  chunk_index: 0,
                  content: "Paragraph 1 with TypeScript details.",
                  metadata: { chunk_index: 0 },
                  embedding: `[${createMockVector(0).join(",")}]`,
                  created_at: new Date(),
                },
                {
                  id: "chunk-2",
                  document_id: mockDocId,
                  chunk_index: 1,
                  content: "Paragraph 2 with PostgreSQL details.",
                  metadata: { chunk_index: 1 },
                  embedding: `[${createMockVector(1).join(",")}]`,
                  created_at: new Date(),
                },
              ],
              rowCount: 2,
            } as unknown as pg.QueryResult;
          }

          return { rows: [], rowCount: 0 } as unknown as pg.QueryResult;
        },
        release: () => {
          clientReleased = true;
        },
      } as unknown as pg.PoolClient;

      const mockPool: pg.Pool = {
        connect: async () => mockClient,
      } as unknown as pg.Pool;

      const mockEmbeddingsClient: EmbeddingsClient = {
        embedQuery: async () => createMockVector(0),
        embedDocuments: async (texts: string[]) => texts.map((_, i) => createMockVector(i)),
      };

      const result = await storeDocumentWithChunks(
        {
          title: "Test Ingest",
          document_type: "resume",
          raw_text: sampleText,
        },
        {
          embeddingsClient: mockEmbeddingsClient,
          pool: mockPool,
        },
      );

      assert.equal(result.document.id, mockDocId);
      assert.equal(result.chunks.length, 2);
      assert.equal(result.chunks[0].chunk_index, 0);
      assert.equal(result.chunks[1].chunk_index, 1);
      assert.equal(result.chunks[0].embedding?.length, 768);
      assert.equal(result.chunks[0].embedding?.[0], 1.0);
      assert.equal(result.chunks[1].embedding?.[1], 1.0);

      // Verify transaction query sequence: BEGIN -> INSERT doc -> INSERT chunks -> COMMIT
      assert.equal(queryHistory[0], "BEGIN;");
      assert.ok(queryHistory[1].includes("INSERT INTO documents"));
      assert.ok(queryHistory[2].includes("INSERT INTO document_chunks"));
      assert.equal(queryHistory[3], "COMMIT;");

      // Verify client release
      assert.equal(clientReleased, true, "Client must be released back to the pool after commit");
    });

    it("2. rolls back transaction if database chunk insertion fails", async () => {
      let clientReleased = false;
      const queryHistory: string[] = [];

      const mockClient: pg.PoolClient = {
        query: async (queryText: string) => {
          queryHistory.push(queryText.trim());

          if (queryText.includes("BEGIN")) {
            return { rows: [], rowCount: 0 } as unknown as pg.QueryResult;
          }

          if (queryText.includes("INSERT INTO documents")) {
            return {
              rows: [
                {
                  id: "temp-doc",
                  title: "Fail Doc",
                  document_type: "resume",
                  raw_text: "Some text",
                  metadata: {},
                  created_at: new Date(),
                  updated_at: new Date(),
                },
              ],
              rowCount: 1,
            } as unknown as pg.QueryResult;
          }

          if (queryText.includes("INSERT INTO document_chunks")) {
            throw new Error("Database disk full or constraint violation");
          }

          if (queryText.includes("ROLLBACK")) {
            return { rows: [], rowCount: 0 } as unknown as pg.QueryResult;
          }

          return { rows: [], rowCount: 0 } as unknown as pg.QueryResult;
        },
        release: () => {
          clientReleased = true;
        },
      } as unknown as pg.PoolClient;

      const mockPool: pg.Pool = {
        connect: async () => mockClient,
      } as unknown as pg.Pool;

      const mockEmbeddingsClient: EmbeddingsClient = {
        embedQuery: async () => createMockVector(0),
        embedDocuments: async (texts: string[]) => texts.map(() => createMockVector(0)),
      };

      await assert.rejects(
        async () => {
          await storeDocumentWithChunks(
            {
              title: "Fail Doc",
              document_type: "resume",
              raw_text: "Some valid text content",
            },
            {
              embeddingsClient: mockEmbeddingsClient,
              pool: mockPool,
            },
          );
        },
        { message: /Database disk full/ },
      );

      assert.ok(queryHistory.includes("BEGIN;"));
      assert.ok(queryHistory.includes("ROLLBACK;"));
      assert.equal(clientReleased, true, "Client must be released back to the pool after rollback");
    });

    it("3. rejects empty or whitespace-only raw_text with TypeError", async () => {
      await assert.rejects(
        async () => {
          await storeDocumentWithChunks({
            title: "Empty Doc",
            document_type: "resume",
            raw_text: "   ",
          });
        },
        { name: "TypeError", message: /Raw text must be a non-empty string/ },
      );
    });
  });

  describe("service pass-through functions", () => {
    it("4. getDocumentById delegates to repository and returns DocumentRecord or null", async () => {
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

      const found = await getDocumentById("doc-1", mockPool);
      assert.equal(found?.id, "doc-1");

      const notFound = await getDocumentById("doc-nonexistent", mockPool);
      assert.equal(notFound, null);
    });

    it("5. getDocumentChunks delegates to repository and returns ordered chunks with parsed vector", async () => {
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

      const chunks = await getDocumentChunks("doc-1", mockPool);
      assert.equal(chunks.length, 1);
      assert.equal(chunks[0].chunk_index, 0);
      assert.ok(Array.isArray(chunks[0].embedding));
      assert.equal(chunks[0].embedding[5], 1.0);
    });

    it("6. deleteDocument delegates to repository and returns boolean", async () => {
      let deletedId: unknown = null;

      const mockPool: pg.Pool = {
        query: async (_: string, params?: unknown[]) => {
          deletedId = params?.[0];
          return { rows: [], rowCount: 1 } as unknown as pg.QueryResult;
        },
      } as unknown as pg.Pool;

      const result = await deleteDocument("doc-to-delete", mockPool);
      assert.equal(result, true);
      assert.equal(deletedId, "doc-to-delete");
    });
  });
});
