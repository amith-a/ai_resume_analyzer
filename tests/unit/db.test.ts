import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { pool, closePool } from "../../src/config/db.js";

describe("Database Configuration & Pool Lifecycle (Phase 14 — Block 3)", () => {
  it("1. closePool invokes pool.end to drain connection pool", async () => {
    let poolEnded = false;
    const originalEnd = pool.end.bind(pool);

    // Mock pool.end to test clean invocation without actually closing the global pool for other tests
    mock.method(pool, "end", async () => {
      poolEnded = true;
    });

    try {
      await closePool();
      assert.equal(poolEnded, true, "closePool must invoke pool.end");
    } finally {
      mock.reset();
      pool.end = originalEnd;
    }
  });

  it("2. idle client error listener logs without calling process.exit", () => {
    let exitCalled = false;
    const originalExit = process.exit;

    process.exit = (() => {
      exitCalled = true;
      throw new Error("process.exit called");
    }) as unknown as typeof process.exit;

    try {
      // Simulate unexpected error on idle pool client
      const errorListeners = pool.listeners("error");
      assert.ok(errorListeners.length > 0, "Pool must have an error listener attached");

      // Verify invoking listener does not call process.exit
      for (const listener of errorListeners) {
        listener(new Error("Simulated idle client disconnect"));
      }

      assert.equal(exitCalled, false, "Idle client error listener must not call process.exit");
    } finally {
      process.exit = originalExit;
    }
  });
});
