import path from 'path';
import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import { apiRouter } from './routes/index.js';
import { errorHandler } from './middleware/errorHandler.js';

export function createApp(): Express {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
  app.use(express.json({ limit: '10mb' }));
  app.use(cookieParser());

  // Local disk storage fallback — only active when R2_ACCOUNT_ID is not set
  if (!env.R2_ACCOUNT_ID) {
    app.use('/local-uploads', express.static(path.join(process.cwd(), 'uploads')));
  }

  app.use('/api', apiRouter);

  app.use(errorHandler);

  return app;
}
