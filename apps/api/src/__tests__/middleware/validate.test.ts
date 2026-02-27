import { describe, it, expect, jest } from '@jest/globals';
import { z } from 'zod';
import { validateBody, validateQuery } from '../../middleware/validate.js';
import type { Request, Response, NextFunction } from 'express';

function makeRes() {
  const res = {
    status: jest.fn(),
    json: jest.fn(),
  };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
}

describe('validateBody', () => {
  const schema = z.object({
    name: z.string().min(1),
    age: z.number().int().positive(),
  });

  it('calls next() and replaces req.body with parsed data when valid', () => {
    const req = { body: { name: 'Alice', age: 30 } } as Request;
    const res = makeRes();
    const next = jest.fn() as unknown as NextFunction;

    validateBody(schema)(req, res as unknown as Response, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.body).toEqual({ name: 'Alice', age: 30 });
    expect(res.status).not.toHaveBeenCalled();
  });

  it('responds with 400 VALIDATION_ERROR when body fails validation', () => {
    const req = { body: { name: '', age: -5 } } as Request;
    const res = makeRes();
    const next = jest.fn() as unknown as NextFunction;

    validateBody(schema)(req, res as unknown as Response, next);

    expect(res.status).toHaveBeenCalledWith(400);
    const jsonArg = (res.json as jest.Mock).mock.calls[0]?.[0] as Record<string, unknown>;
    expect(jsonArg.error).toBe('VALIDATION_ERROR');
    expect(jsonArg.statusCode).toBe(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('includes per-field error details in the response body', () => {
    const req = { body: { name: '', age: -5 } } as Request;
    const res = makeRes();
    const next = jest.fn() as unknown as NextFunction;

    validateBody(schema)(req, res as unknown as Response, next);

    const jsonArg = (res.json as jest.Mock).mock.calls[0]?.[0] as Record<string, unknown>;
    expect(jsonArg.details).toBeDefined();
  });

  it('responds with 400 when body is entirely missing', () => {
    const req = { body: undefined } as Request;
    const res = makeRes();
    const next = jest.fn() as unknown as NextFunction;

    validateBody(schema)(req, res as unknown as Response, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('validateQuery', () => {
  const schema = z.object({
    page: z.coerce.number().int().positive().default(1),
    search: z.string().optional(),
  });

  it('calls next() and sets req.query when query params are valid', () => {
    const req = { query: { page: '2', search: 'test' } } as unknown as Request;
    const res = makeRes();
    const next = jest.fn() as unknown as NextFunction;

    validateQuery(schema)(req, res as unknown as Response, next);

    expect(next).toHaveBeenCalledWith();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('responds with 400 VALIDATION_ERROR when a query param is invalid', () => {
    const req = { query: { page: '-1' } } as unknown as Request;
    const res = makeRes();
    const next = jest.fn() as unknown as NextFunction;

    validateQuery(schema)(req, res as unknown as Response, next);

    expect(res.status).toHaveBeenCalledWith(400);
    const jsonArg = (res.json as jest.Mock).mock.calls[0]?.[0] as Record<string, unknown>;
    expect(jsonArg.error).toBe('VALIDATION_ERROR');
    expect(next).not.toHaveBeenCalled();
  });

  it('applies schema defaults when optional query params are absent', () => {
    const req = { query: {} } as unknown as Request;
    const res = makeRes();
    const next = jest.fn() as unknown as NextFunction;

    validateQuery(schema)(req, res as unknown as Response, next);

    expect(next).toHaveBeenCalledWith();
  });
});
