import { NextFunction, Request, Response } from "express";
import { ZodSchema } from "zod";
import { ValidationError } from "../utils/errors.js";

export function validate(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const message = result.error.issues.map((e) => e.message).join(", ");
      return next(new ValidationError(message));
    }
    req.body = result.data;
    next();
  };
}

/** Validates `req.query` and stores the parsed values on `res.locals.query` (Express 5 makes req.query read-only). */
export function validateQuery(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      const message = result.error.issues.map((e) => e.message).join(", ");
      return next(new ValidationError(message));
    }
    res.locals.query = result.data;
    next();
  };
}
