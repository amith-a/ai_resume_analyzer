import { env } from "./config/env.js";
import { app } from "./app.js";
import { closePool } from "./config/db.js";
import { logger } from "./config/logger.js";

const server = app.listen(env.PORT, () => {
  logger.info(
    { port: env.PORT, nodeEnv: env.NODE_ENV },
    `Server listening on port ${env.PORT} in ${env.NODE_ENV} mode`,
  );
});

let isShuttingDown = false;

const gracefulShutdown = async (signal: string) => {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;

  logger.info({ signal }, `Received ${signal}. Starting graceful shutdown...`);

  const timeoutTimer = setTimeout(() => {
    logger.error("Forced shutdown due to timeout");
    process.exit(1);
  }, 3000);
  timeoutTimer.unref();

  server.close(async () => {
    logger.info("HTTP server closed.");
    try {
      await closePool();
      logger.info("PostgreSQL connection pool drained.");
      process.exit(0);
    } catch (err: unknown) {
      const errorType = err instanceof Error ? err.name : "Error";
      logger.error({ errorType }, `Error closing PostgreSQL pool (${errorType})`);
      process.exit(1);
    }
  });
};

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
