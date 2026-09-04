import pg from "pg";
import { env } from "../../src/config/env.js";

const { Pool } = pg;

/**
 * Resolves the PostgreSQL connection string for tests strictly from DATABASE_URL_TEST.
 * If running on the host machine where the Docker hostname 'postgres' cannot be resolved,
 * rewrites the host to 'localhost' while preserving credentials, port, and database name.
 */
export function resolveTestDatabaseUrl(): string {
  const connectionString = env.DATABASE_URL_TEST;

  if (!connectionString) {
    return "";
  }

  try {
    const parsed = new URL(connectionString);
    if (parsed.hostname === "postgres") {
      // Check if we are running outside Docker (e.g. host development environment)
      parsed.hostname = "localhost";
      return parsed.toString();
    }
  } catch {
    // Return original string if URL parsing fails
  }

  return connectionString;
}

export interface DbProbeResult {
  isDbAvailable: boolean;
  pool: pg.Pool | null;
  skipReason?: string;
}

/**
 * Probes the test database with a short connection timeout.
 * Returns a clean boolean status and pool instance instead of throwing unhandled errors.
 */
export async function probeTestDatabase(): Promise<DbProbeResult> {
  const connectionString = resolveTestDatabaseUrl();

  if (!connectionString) {
    return {
      isDbAvailable: false,
      pool: null,
      skipReason: "DATABASE_URL_TEST is not configured in .env",
    };
  }

  const pool = new Pool({
    connectionString,
    connectionTimeoutMillis: 2000,
  });

  try {
    await pool.query("SELECT 1;");
    return {
      isDbAvailable: true,
      pool,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    // Gracefully close pool on connection failure
    try {
      await pool.end();
    } catch {
      // pass
    }

    return {
      isDbAvailable: false,
      pool: null,
      skipReason: `Database unreachable at ${connectionString}: ${errorMsg}`,
    };
  }
}
