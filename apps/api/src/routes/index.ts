import { Router } from 'express';
import { authRouter } from './auth.routes.js';
import { claimsRouter } from './claims.routes.js';
import { documentsRouter } from './documents.routes.js';
import { analyticsRouter } from './analytics.routes.js';
import { providersRouter } from './providers.routes.js';

export const apiRouter: Router = Router();

apiRouter.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

apiRouter.use('/auth', authRouter);
apiRouter.use('/claims', claimsRouter);
apiRouter.use('/claims/:claimId/documents', documentsRouter);
apiRouter.use('/analytics', analyticsRouter);
apiRouter.use('/providers', providersRouter);
