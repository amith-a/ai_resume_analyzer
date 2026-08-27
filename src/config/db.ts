import pg from "pg";
import { env } from "./env.js";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
});

pool.on("error", (err) => {
  console.error("Unexpected error on idle PostgreSQL client", err);
});
