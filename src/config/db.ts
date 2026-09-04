import pg from "pg";
import { env } from "./env.js";
import { logger } from "./logger.js";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on("error", (err) => {
  const errorType = err instanceof Error ? err.name : "Error";
  logger.error(
    {
      operation: "db_idle_client_error",
      status: "error",
      errorType,
    },
    `Unexpected error on idle PostgreSQL client (${errorType})`,
  );
});

export async function closePool(): Promise<void> {
  await pool.end();
}
