import { describe, it } from "node:test";
import assert from "node:assert";
import {
  toVectorSql,
  parseVectorSql,
  DEFAULT_VECTOR_DIMENSION,
} from "../src/utils/vector.utils.js";

describe("Vector Utils Unit Tests", () => {
  describe("toVectorSql", () => {
    it("1. formats a valid float array into a PostgreSQL vector string literal", () => {
      const vec = [0.1, 0.2, 0.3];
      const result = toVectorSql(vec, 3);
      assert.equal(result, "[0.1,0.2,0.3]");
    });

    it("2. formats a Float32Array into a PostgreSQL vector string literal", () => {
      const vec = new Float32Array([1.5, -2.5, 0.0]);
      const result = toVectorSql(vec, 3);
      assert.equal(result, "[1.5,-2.5,0]");
    });

    it("3. validates and formats a 768-dimensional vector by default", () => {
      const vec = new Array(DEFAULT_VECTOR_DIMENSION).fill(0.01);
      const result = toVectorSql(vec);
      assert.ok(result.startsWith("[0.01,0.01,"));
      assert.ok(result.endsWith(",0.01]"));
    });

    it("4. throws an error when dimension does not match expected dimension", () => {
      const vec = [0.1, 0.2];
      assert.throws(
        () => toVectorSql(vec, 3),
        /Vector dimension mismatch: expected 3, received 2/
      );
    });

    it("5. throws an error when vector is empty", () => {
      assert.throws(
        () => toVectorSql([], 0),
        /Vector cannot be empty/
      );
    });

    it("6. throws an error when vector contains NaN", () => {
      const vec = [0.1, Number.NaN, 0.3];
      assert.throws(
        () => toVectorSql(vec, 3),
        /Vector contains invalid number at index 1: NaN/
      );
    });

    it("7. throws an error when vector contains Infinity", () => {
      const vec = [0.1, Number.POSITIVE_INFINITY, 0.3];
      assert.throws(
        () => toVectorSql(vec, 3),
        /Vector contains invalid number at index 1: Infinity/
      );
    });

    it("8. throws an error when input is not an array or Float32Array", () => {
      assert.throws(
        () => toVectorSql("invalid" as any),
        /Vector must be a valid array or Float32Array/
      );
    });
  });

  describe("parseVectorSql", () => {
    it("1. parses a standard PostgreSQL vector string into a number array", () => {
      const parsed = parseVectorSql("[0.1,0.2,0.3]");
      assert.deepEqual(parsed, [0.1, 0.2, 0.3]);
    });

    it("2. handles surrounding and inner whitespace cleanly", () => {
      const parsed = parseVectorSql("  [ 1.5 , -2.25 , 0.5 ]  ");
      assert.deepEqual(parsed, [1.5, -2.25, 0.5]);
    });

    it("3. returns empty array for '[]'", () => {
      const parsed = parseVectorSql("[]");
      assert.deepEqual(parsed, []);
    });

    it("4. throws on invalid vector format (missing brackets)", () => {
      assert.throws(
        () => parseVectorSql("0.1,0.2,0.3"),
        /Invalid vector string format/
      );
    });

    it("5. throws on non-numeric elements", () => {
      assert.throws(
        () => parseVectorSql("[0.1,abc,0.3]"),
        /Failed to parse float at index 1: "abc"/
      );
    });

    it("6. throws on non-string input", () => {
      assert.throws(
        () => parseVectorSql(null as any),
        /Vector string must be a non-empty string/
      );
    });
  });
});
