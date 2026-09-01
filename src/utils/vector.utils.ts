/**
 * Vector Utility Functions for pgvector
 *
 * Provides safe serialization, validation, and parsing between JavaScript
 * number arrays and PostgreSQL vector literal representations ('[0.1,0.2,...]').
 */

export const DEFAULT_VECTOR_DIMENSION = 768;

/**
 * Formats a JavaScript number array into a PostgreSQL vector string literal.
 * Performs defensive validation on dimension, element types, and finite values.
 *
 * @param vector - Array or Float32Array of numbers
 * @param expectedDim - Optional expected dimension to enforce (default: 768)
 * @returns Serialized vector string in format `[0.1,0.2,0.3]`
 * @throws Error if vector is empty, invalid, contains NaN/Infinity, or has wrong dimension
 */
export function toVectorSql(
  vector: number[] | Float32Array,
  expectedDim: number = DEFAULT_VECTOR_DIMENSION,
): string {
  if (!vector || (!ArrayBuffer.isView(vector) && !Array.isArray(vector))) {
    throw new Error("Vector must be a valid array or Float32Array of numbers");
  }

  const length = vector.length;

  if (length === 0) {
    throw new Error("Vector cannot be empty");
  }

  if (expectedDim !== undefined && length !== expectedDim) {
    throw new Error(`Vector dimension mismatch: expected ${expectedDim}, received ${length}`);
  }

  const elements: string[] = new Array(length);

  for (let i = 0; i < length; i++) {
    const val = vector[i];
    if (typeof val !== "number" || !Number.isFinite(val)) {
      throw new Error(`Vector contains invalid number at index ${i}: ${val}`);
    }
    elements[i] = val.toString();
  }

  return `[${elements.join(",")}]`;
}

/**
 * Parses a PostgreSQL vector string literal (e.g. `[0.1,0.2,0.3]`) into a JavaScript number array.
 *
 * @param vectorStr - PostgreSQL vector string representation
 * @returns Array of numbers
 * @throws Error if vector string format is invalid or contains non-numeric values
 */
export function parseVectorSql(vectorStr: string): number[] {
  if (!vectorStr || typeof vectorStr !== "string") {
    throw new Error("Vector string must be a non-empty string");
  }

  const trimmed = vectorStr.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) {
    throw new Error(`Invalid vector string format: ${vectorStr}`);
  }

  const inner = trimmed.slice(1, -1).trim();
  if (inner.length === 0) {
    return [];
  }

  const parts = inner.split(",");
  const result: number[] = new Array(parts.length);

  for (let i = 0; i < parts.length; i++) {
    const num = Number(parts[i].trim());
    if (!Number.isFinite(num)) {
      throw new Error(`Failed to parse float at index ${i}: "${parts[i]}"`);
    }
    result[i] = num;
  }

  return result;
}
