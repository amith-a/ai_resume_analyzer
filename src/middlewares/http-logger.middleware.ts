import { pinoHttp, type HttpLogger, type Options } from "pino-http";
import type { IncomingMessage, ServerResponse } from "node:http";
import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { logger, requestContextStorage } from "../config/logger.js";

/**
 * Validates whether an incoming string looks like a safe request ID.
 */
function isValidRequestId(id: unknown): id is string {
  return typeof id === "string" && id.trim().length > 0 && id.length <= 128;
}

export const pinoHttpOptions: Options<IncomingMessage, ServerResponse> = {
  logger,
  genReqId: (req: IncomingMessage, res: ServerResponse) => {
    const incomingId = req.headers["x-request-id"];
    const id = isValidRequestId(incomingId) ? incomingId.trim() : crypto.randomUUID();
    res.setHeader("x-request-id", id);
    return id;
  },
  customLogLevel: (_req: IncomingMessage, res: ServerResponse, err?: Error) => {
    if (res.statusCode >= 500 || err) return "error";
    if (res.statusCode >= 400) return "warn";
    return "info";
  },
  customProps: (req: IncomingMessage) => ({
    requestId: req.id,
  }),
  customAttributeKeys: {
    responseTime: "durationMs",
  },
  serializers: {
    req: (req: IncomingMessage) => ({
      id: req.id,
      method: req.method,
      // Strip query parameters to avoid leaking query tokens or search values
      url: req.url?.split("?")[0],
    }),
    res: (res: ServerResponse) => ({
      statusCode: res.statusCode,
    }),
    // Omit err serializer to prevent duplicate stack trace dumps; centralized error middleware logs safe metadata
    err: () => undefined,
  },
  customSuccessMessage: (req: IncomingMessage, res: ServerResponse, responseTime: number) => {
    const path = req.url?.split("?")[0] ?? req.url;
    return `${req.method} ${path} ${res.statusCode} in ${Math.round(responseTime)}ms`;
  },
  customErrorMessage: (req: IncomingMessage, res: ServerResponse) => {
    const path = req.url?.split("?")[0] ?? req.url;
    return `${req.method} ${path} ${res.statusCode}`;
  },
};

/**
 * Underlying pino-http instance configured for safe request lifecycle logging.
 */
export const httpPinoInstance: HttpLogger = pinoHttp(pinoHttpOptions);

/**
 * Express middleware for request logging and request-ID propagation via AsyncLocalStorage.
 */
export function httpLoggerMiddleware(req: Request, res: Response, next: NextFunction): void {
  httpPinoInstance(req, res);

  const requestId = (req.id as string) || (res.getHeader("x-request-id") as string);
  requestContextStorage.run({ requestId }, () => {
    next();
  });
}
