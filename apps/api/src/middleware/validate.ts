import { NextFunction, Request, Response } from 'express';
import { ZodSchema } from 'zod';

export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      _res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid request body',
        statusCode: 400,
        details: result.error.flatten().fieldErrors,
      });
      return;
    }
    req.body = result.data;
    next();
  };
}

export function validateQuery<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      _res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid query parameters',
        statusCode: 400,
        details: result.error.flatten().fieldErrors,
      });
      return;
    }
    req.query = result.data as typeof req.query;
    next();
  };
}
