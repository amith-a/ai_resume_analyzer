import type { Request, Response, NextFunction, RequestHandler } from "express";
import type { ZodType } from "zod";

/**
 * Interface defining optional Zod validation schemas for request parts.
 */
export interface RequestValidationSchemas<TBody = unknown, TParams = unknown, TQuery = unknown> {
  body?: ZodType<TBody>;
  params?: ZodType<TParams>;
  query?: ZodType<TQuery>;
}

/**
 * Universal Request Validation Middleware: Validates any combination of `params`, `query`,
 * and `body` against provided Zod schemas.
 *
 * If validation fails at any stage, halts request processing and immediately responds with
 * 400 Bad Request and detailed schema issues.
 */
export function validateRequest<TBody = unknown, TParams = unknown, TQuery = unknown>(
  schemas: RequestValidationSchemas<TBody, TParams, TQuery>,
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    // 1. Validate route params if schema provided
    if (schemas.params) {
      const paramsResult = schemas.params.safeParse(req.params);
      if (!paramsResult.success) {
        res.status(400).json({
          status: "error",
          message: paramsResult.error.issues[0]?.message ?? "Invalid route parameters",
          issues: paramsResult.error.issues,
        });
        return;
      }
      req.params = paramsResult.data as unknown as Request["params"];
    }

    // 2. Validate query params if schema provided
    if (schemas.query) {
      const queryResult = schemas.query.safeParse(req.query);
      if (!queryResult.success) {
        res.status(400).json({
          status: "error",
          message: queryResult.error.issues[0]?.message ?? "Invalid query parameters",
          issues: queryResult.error.issues,
        });
        return;
      }
      req.query = queryResult.data as unknown as Request["query"];
    }

    // 3. Validate request body if schema provided
    if (schemas.body) {
      const bodyResult = schemas.body.safeParse(req.body);
      if (!bodyResult.success) {
        res.status(400).json({
          status: "error",
          message: bodyResult.error.issues[0]?.message ?? "Invalid request payload",
          issues: bodyResult.error.issues,
        });
        return;
      }
      req.body = bodyResult.data;
    }

    next();
  };
}

/**
 * Shorthand helper for validating only the request body.
 */
export function validateBody<T>(schema: ZodType<T>): RequestHandler {
  return validateRequest({ body: schema });
}
