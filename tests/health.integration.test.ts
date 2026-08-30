import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import type { Server } from "node:http";
import { app } from "../src/app.js";

describe("Health Routes Integration Tests", () => {
  let server: Server;
  let baseUrl: string;

  before(async () => {
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const address = server.address();
        if (address && typeof address === "object") {
          baseUrl = `http://localhost:${address.port}`;
        }
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  it("1. GET /health returns 200 OK with status: ok", async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);
    const json = (await res.json()) as any;
    assert.equal(json.status, "ok");
  });

  it("2. GET /health/db returns 200 OK and includes pgvector version info if DB connected", async () => {
    const res = await fetch(`${baseUrl}/health/db`);
    if (res.status === 200) {
      const json = (await res.json()) as any;
      assert.equal(json.status, "ok");
      assert.equal(json.database, "connected");
      assert.ok(json.pgvector, "Expected pgvector field in /health/db response");
    } else {
      assert.equal(res.status, 500);
      const json = (await res.json()) as any;
      assert.equal(json.status, "error");
      assert.equal(json.database, "disconnected");
    }
  });
});
