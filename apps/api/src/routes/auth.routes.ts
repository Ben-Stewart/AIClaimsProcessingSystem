import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { LoginSchema, RegisterSchema, UserRole } from '@claims/shared';
import { prisma } from '../config/database.js';
import { env } from '../config/env.js';
import { validateBody } from '../middleware/validate.js';
import { authenticate } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';

export const authRouter: Router = Router();

authRouter.post('/login', validateBody(LoginSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;

    const policySelect = { policyNumber: true, coverageType: true, coverageLimit: true, deductible: true, percentCovered: true, reasonableAndCustomary: true, effectiveDate: true, expiryDate: true };

    const user = await prisma.user.findUnique({
      where: { email },
      include: { policy: { select: policySelect } },
    });
    if (!user) {
      throw new AppError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new AppError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');
    }

    const payload = { userId: user.id, email: user.email, role: user.role };

    const accessToken = jwt.sign(payload, env.JWT_SECRET, {
      expiresIn: env.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions['expiresIn'],
    });
    const refreshToken = jwt.sign(payload, env.JWT_REFRESH_SECRET, {
      expiresIn: env.JWT_REFRESH_EXPIRES_IN as jwt.SignOptions['expiresIn'],
    });

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      data: {
        accessToken,
        user: { id: user.id, email: user.email, name: user.name, role: user.role, createdAt: user.createdAt, policy: user.policy },
      },
    });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.cookies?.refreshToken as string | undefined;
    if (!token) throw new AppError(401, 'No refresh token', 'UNAUTHORIZED');

    const payload = jwt.verify(token, env.JWT_REFRESH_SECRET) as {
      userId: string;
      email: string;
      role: string;
    };

    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user) throw new AppError(401, 'User not found', 'UNAUTHORIZED');

    const newPayload = { userId: user.id, email: user.email, role: user.role };
    const accessToken = jwt.sign(newPayload, env.JWT_SECRET, {
      expiresIn: env.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions['expiresIn'],
    });

    res.json({ data: { accessToken } });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/register', validateBody(RegisterSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password, name, policyNumber } = req.body;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw new AppError(409, 'An account with this email already exists', 'EMAIL_TAKEN');

    const policy = await prisma.policy.findUnique({ where: { policyNumber } });
    if (!policy) throw new AppError(404, 'Policy number not found', 'POLICY_NOT_FOUND');
    if (policy.clientId) throw new AppError(409, 'An account is already registered for this policy', 'POLICY_CLAIMED');

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: { email, name, role: UserRole.CLIENT, passwordHash },
    });

    await prisma.policy.update({
      where: { id: policy.id },
      data: { clientId: user.id },
    });

    const tokenPayload = { userId: user.id, email: user.email, role: user.role };

    const accessToken = jwt.sign(tokenPayload, env.JWT_SECRET, {
      expiresIn: env.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions['expiresIn'],
    });
    const refreshToken = jwt.sign(tokenPayload, env.JWT_REFRESH_SECRET, {
      expiresIn: env.JWT_REFRESH_EXPIRES_IN as jwt.SignOptions['expiresIn'],
    });

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    const userPolicy = {
      policyNumber: policy.policyNumber,
      coverageType: policy.coverageType,
      coverageLimit: policy.coverageLimit,
      deductible: policy.deductible,
      percentCovered: policy.percentCovered,
      reasonableAndCustomary: policy.reasonableAndCustomary,
      effectiveDate: policy.effectiveDate,
      expiryDate: policy.expiryDate,
    };

    res.status(201).json({
      data: {
        accessToken,
        user: { id: user.id, email: user.email, name: user.name, role: user.role, createdAt: user.createdAt, policy: userPolicy },
      },
    });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/logout', (_req: Request, res: Response) => {
  res.clearCookie('refreshToken');
  res.json({ data: { message: 'Logged out successfully' } });
});

authRouter.get('/me', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
        policy: { select: { policyNumber: true, coverageType: true, coverageLimit: true, deductible: true, percentCovered: true, reasonableAndCustomary: true, effectiveDate: true, expiryDate: true } },
      },
    });
    if (!user) throw new AppError(404, 'User not found', 'NOT_FOUND');
    res.json({ data: user });
  } catch (err) {
    next(err);
  }
});
