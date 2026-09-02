import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import type { Request, Response } from "express";
import { validateRequest, validateBody } from "../src/middlewares/validation.middleware.js";

function createMockReqRes(reqPartial: Partial<Request> = {}) {
  const req = {
    body: {},
    params: {},
    query: {},
    ...reqPartial,
  } as Request;

  let statusCode = 200;
  let jsonResponse: unknown = null;

  const res = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(data: unknown) {
      jsonResponse = data;
      return this;
    },
  } as unknown as Response;

  return {
    req,
    res,
    getStatus: () => statusCode,
    getJson: () => jsonResponse as any,
  };
}

describe("Validation Middleware Unit Tests", () => {
  it("1. validateBody passes valid body and calls next()", () => {
    const schema = z.object({ name: z.string().min(1) });
    const middleware = validateBody(schema);
    const { req, res } = createMockReqRes({ body: { name: "Alice" } });

    let calledNext = false;
    middleware(req, res, () => {
      calledNext = true;
    });

    assert.equal(calledNext, true);
    assert.deepEqual(req.body, { name: "Alice" });
  });

  it("2. validateBody halts with 400 when body is invalid", () => {
    const schema = z.object({
      name: z.string({ message: "Name is required" }).min(1, "Name cannot be empty"),
    });
    const middleware = validateBody(schema);
    const { req, res, getStatus, getJson } = createMockReqRes({ body: {} });

    let calledNext = false;
    middleware(req, res, () => {
      calledNext = true;
    });

    assert.equal(calledNext, false);
    assert.equal(getStatus(), 400);
    assert.equal(getJson().status, "error");
    assert.match(getJson().message, /Name is required|Name cannot be empty/);
  });

  it("3. validateRequest validates params correctly", () => {
    const paramsSchema = z.object({ id: z.uuid("Invalid UUID format") });
    const middleware = validateRequest({ params: paramsSchema });

    // Invalid UUID
    const invalidMock = createMockReqRes({ params: { id: "not-a-uuid" } });
    let nextCalled = false;
    middleware(invalidMock.req, invalidMock.res, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, false);
    assert.equal(invalidMock.getStatus(), 400);
    assert.match(invalidMock.getJson().message, /Invalid UUID format/);

    // Valid UUID
    const validUuid = "123e4567-e89b-12d3-a456-426614174000";
    const validMock = createMockReqRes({ params: { id: validUuid } });
    let validNextCalled = false;
    middleware(validMock.req, validMock.res, () => {
      validNextCalled = true;
    });
    assert.equal(validNextCalled, true);
    assert.equal(validMock.req.params.id, validUuid);
  });

  it("4. validateRequest validates query params correctly", () => {
    const querySchema = z.object({
      topK: z.coerce.number().int().positive("topK must be positive"),
    });
    const middleware = validateRequest({ query: querySchema });

    // Invalid query
    const invalidMock = createMockReqRes({ query: { topK: "-5" } });
    let nextCalled = false;
    middleware(invalidMock.req, invalidMock.res, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, false);
    assert.equal(invalidMock.getStatus(), 400);
    assert.match(invalidMock.getJson().message, /topK must be positive/);

    // Valid query
    const validMock = createMockReqRes({ query: { topK: "10" } });
    let validNextCalled = false;
    middleware(validMock.req, validMock.res, () => {
      validNextCalled = true;
    });
    assert.equal(validNextCalled, true);
    assert.deepEqual(validMock.req.query, { topK: 10 });
  });

  it("5. validateRequest validates combinations of params, query, and body in one pass", () => {
    const middleware = validateRequest({
      params: z.object({ id: z.string().min(1) }),
      query: z.object({ filter: z.string().optional() }),
      body: z.object({ prompt: z.string().min(1) }),
    });

    const { req, res } = createMockReqRes({
      params: { id: "doc-123" },
      query: { filter: "recent" },
      body: { prompt: "Explain experience" },
    });

    let nextCalled = false;
    middleware(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, true);
    assert.equal(req.params.id, "doc-123");
    assert.equal(req.query.filter, "recent");
    assert.equal((req.body as any).prompt, "Explain experience");
  });
});
