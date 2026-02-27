import { describe, it, expect, jest } from '@jest/globals';
import { z } from 'zod';
import { AppError, errorHandler } from '../../middleware/errorHandler.js';
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

function makeZodError(): z.ZodError {
  const result = z.object({ name: z.string().min(1) }).safeParse({ name: 123 });
  if (!result.success) return result.error;
  throw new Error('Expected a ZodError but parsing succeeded');
}

const mockReq = {} as Request;
const mockNext = jest.fn() as unknown as NextFunction;

describe('AppError', () => {
  it('stores statusCode, message, and code', () => {
    const err = new AppError(404, 'Not found', 'NOT_FOUND');
    expect(err.statusCode).toBe(404);
    expect(err.message).toBe('Not found');
    expect(err.code).toBe('NOT_FOUND');
  });

  it('sets name to "AppError"', () => {
    expect(new AppError(400, 'Bad request').name).toBe('AppError');
  });

  it('is an instance of Error', () => {
    expect(new AppError(500, 'Server error')).toBeInstanceOf(Error);
  });

  it('allows omitting the optional code', () => {
    const err = new AppError(500, 'Server error');
    expect(err.code).toBeUndefined();
  });
});

describe('errorHandler', () => {
  it('returns the AppError status code and JSON body', () => {
    const res = makeRes();
    errorHandler(new AppError(422, 'Unprocessable', 'UNPROCESSABLE'), mockReq, res as unknown as Response, mockNext);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith({
      error: 'UNPROCESSABLE',
      message: 'Unprocessable',
      statusCode: 422,
    });
  });

  it('falls back to "APP_ERROR" code when AppError.code is undefined', () => {
    const res = makeRes();
    errorHandler(new AppError(500, 'Oops'), mockReq, res as unknown as Response, mockNext);

    const jsonArg = (res.json as jest.Mock).mock.calls[0]?.[0] as Record<string, unknown>;
    expect(jsonArg.error).toBe('APP_ERROR');
  });

  it('returns 400 VALIDATION_ERROR for a ZodError', () => {
    const res = makeRes();
    errorHandler(makeZodError(), mockReq, res as unknown as Response, mockNext);

    expect(res.status).toHaveBeenCalledWith(400);
    const jsonArg = (res.json as jest.Mock).mock.calls[0]?.[0] as Record<string, unknown>;
    expect(jsonArg.error).toBe('VALIDATION_ERROR');
    expect(jsonArg.statusCode).toBe(400);
    expect(jsonArg.details).toBeDefined();
  });

  it('returns 500 INTERNAL_ERROR for an unknown Error', () => {
    const res = makeRes();
    errorHandler(new Error('Unexpected'), mockReq, res as unknown as Response, mockNext);

    expect(res.status).toHaveBeenCalledWith(500);
    const jsonArg = (res.json as jest.Mock).mock.calls[0]?.[0] as Record<string, unknown>;
    expect(jsonArg.error).toBe('INTERNAL_ERROR');
    expect(jsonArg.statusCode).toBe(500);
  });
});
