import pino, { type Logger, type LoggerOptions, type DestinationStream } from "pino";
import { AsyncLocalStorage } from "node:async_hooks";
import { env } from "./env.js";

export interface RequestContext {
  requestId?: string;
}

export const requestContextStorage = new AsyncLocalStorage<RequestContext>();

/**
 * Returns the current active request ID from asynchronous local storage context, if present.
 */
export function getRequestId(): string | undefined {
  return requestContextStorage.getStore()?.requestId;
}

/**
 * Fields that should be stripped automatically if inadvertently passed to the logger.
 */
export const DEFAULT_REDACT_PATHS = [
  "password",
  "token",
  "authorization",
  "req.headers.authorization",
  "req.headers.cookie",
  "raw_text",
  "resumeText",
  "jobDescription",
  "queryVector",
  "embedding",
  "buffer",
  "file.buffer",
];

/**
 * Creates a configured Pino logger instance with consistent formatting and sanitization.
 */
export function createLogger(options?: LoggerOptions, destination?: DestinationStream): Logger {
  const defaultOptions: LoggerOptions = {
    level: env.LOG_LEVEL ?? "info",
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (label) => ({ level: label }),
    },
    redact: {
      paths: DEFAULT_REDACT_PATHS,
      remove: true,
    },
    ...options,
  };

  return destination ? pino(defaultOptions, destination) : pino(defaultOptions);
}

/**
 * Shared singleton application logger.
 */
export const logger: Logger = createLogger();
