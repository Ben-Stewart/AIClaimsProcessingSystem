import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import jwt from 'jsonwebtoken';
import { authenticate, authorize } from '../../middleware/auth.js';
import { UserRole } from '@claims/shared';
import type { Request, Response, NextFunction } from 'express';
import type { AuthPayload } from '../../middleware/auth.js';

const JWT_SECRET = 'test-secret-key-for-jest-at-least-32-chars';

function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, JWT_SECRET);
}

function makeReq(headers: Record<string, string> = {}, user?: AuthPayload): Partial<Request> {
  return { headers, user } as Partial<Request>;
}

const mockRes = {} as Response;
const mockNext = jest.fn() as unknown as NextFunction;

beforeEach(() => {
  (mockNext as jest.Mock).mockClear();
});

describe('authenticate', () => {
  const payload: AuthPayload = {
    userId: 'user-123',
    email: 'test@example.com',
    role: UserRole.ADJUSTER,
  };

  it('sets req.user and calls next() with a valid Bearer token', () => {
    const token = signToken(payload);
    const req = makeReq({ authorization: `Bearer ${token}` });

    authenticate(req as Request, mockRes, mockNext);

    expect(mockNext).toHaveBeenCalledWith();
    expect(req.user).toMatchObject({ userId: 'user-123', email: 'test@example.com', role: UserRole.ADJUSTER });
  });

  it('calls next with a 401 AppError when no Authorization header is present', () => {
    const req = makeReq({});

    authenticate(req as Request, mockRes, mockNext);

    expect(mockNext).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 401, code: 'UNAUTHORIZED' }),
    );
  });

  it('calls next with a 401 AppError when the token is invalid', () => {
    const req = makeReq({ authorization: 'Bearer invalid.token.value' });

    authenticate(req as Request, mockRes, mockNext);

    expect(mockNext).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 401, code: 'TOKEN_INVALID' }),
    );
  });

  it('calls next with a 401 AppError when the header does not use the Bearer scheme', () => {
    const req = makeReq({ authorization: 'Basic dXNlcjpwYXNz' });

    authenticate(req as Request, mockRes, mockNext);

    expect(mockNext).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 401 }),
    );
  });

  it('calls next with a 401 AppError for an expired token', () => {
    const expiredToken = jwt.sign(payload, JWT_SECRET, { expiresIn: -1 });
    const req = makeReq({ authorization: `Bearer ${expiredToken}` });

    authenticate(req as Request, mockRes, mockNext);

    expect(mockNext).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 401, code: 'TOKEN_INVALID' }),
    );
  });
});

describe('authorize', () => {
  it('calls next() when the user has one of the allowed roles', () => {
    const req = makeReq({}, { userId: '1', email: 'a@b.com', role: UserRole.ADJUSTER });

    authorize(UserRole.ADJUSTER)(req as Request, mockRes, mockNext);

    expect(mockNext).toHaveBeenCalledWith();
  });

  it('calls next() when user matches any role in the allowed list', () => {
    const req = makeReq({}, { userId: '1', email: 'a@b.com', role: UserRole.ADMIN });

    authorize(UserRole.ADJUSTER, UserRole.ADMIN)(req as Request, mockRes, mockNext);

    expect(mockNext).toHaveBeenCalledWith();
  });

  it('calls next with a 403 AppError when the user lacks the required role', () => {
    const req = makeReq({}, { userId: '1', email: 'a@b.com', role: UserRole.CLIENT });

    authorize(UserRole.ADJUSTER, UserRole.ADMIN)(req as Request, mockRes, mockNext);

    expect(mockNext).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 403, code: 'FORBIDDEN' }),
    );
  });

  it('calls next with a 401 AppError when req.user is not set', () => {
    const req = makeReq({});

    authorize(UserRole.ADJUSTER)(req as Request, mockRes, mockNext);

    expect(mockNext).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 401, code: 'UNAUTHORIZED' }),
    );
  });
});
