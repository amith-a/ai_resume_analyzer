import { env } from "./config/env.js";
import { app } from "./app.js";
import { pool } from "./config/db.js";

const server = app.listen(env.PORT, () => {
  console.log(
    `Server listening on port ${env.PORT} in ${env.NODE_ENV} mode`,
  );
});

const gracefulShutdown = async (signal: string) => {
  console.log(`Received ${signal}. Starting graceful shutdown...`);

  if (server.closeAllConnections) {
    server.closeAllConnections();
  }

  server.close(async () => {
    console.log("HTTP server closed.");
    try {
      await pool.end();
      console.log("PostgreSQL connection pool drained.");
      process.exit(0);
    } catch (err) {
      console.error("Error closing PostgreSQL pool:", err);
      process.exit(1);
    }
  });

  setTimeout(() => {
    console.error("Forced shutdown due to timeout");
    process.exit(1);
  }, 3000);
};

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
