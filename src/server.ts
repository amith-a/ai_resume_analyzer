import { env } from "./config/env.js";
import { app } from "./app.js";
import { closePool } from "./config/db.js";

const server = app.listen(env.PORT, () => {
  console.log(`Server listening on port ${env.PORT} in ${env.NODE_ENV} mode`);
});

let isShuttingDown = false;

const gracefulShutdown = async (signal: string) => {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;

  console.log(`Received ${signal}. Starting graceful shutdown...`);

  const timeoutTimer = setTimeout(() => {
    console.error("Forced shutdown due to timeout");
    process.exit(1);
  }, 3000);
  timeoutTimer.unref();

  server.close(async () => {
    console.log("HTTP server closed.");
    try {
      await closePool();
      console.log("PostgreSQL connection pool drained.");
      process.exit(0);
    } catch (err: unknown) {
      const errorType = err instanceof Error ? err.name : "Error";
      console.error(`Error closing PostgreSQL pool (${errorType})`);
      process.exit(1);
    }
  });
};

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
