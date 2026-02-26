import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().optional(), // injected by Railway; takes precedence over API_PORT
  API_PORT: z.coerce.number().default(3001),
  API_URL: z.string().url().default('http://localhost:3001'),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  OPENAI_API_KEY: z.string().startsWith('sk-', 'Invalid OpenAI API key'),
  AZURE_DI_ENDPOINT: z.string().url().optional(),
  AZURE_DI_KEY: z.string().optional(),

  S3_REGION: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_BUCKET_NAME: z.string().default('claims-documents'),

  AUTO_APPROVE_THRESHOLD: z.coerce.number().positive().default(500),

  WORKER_INTERNAL_TOKEN: z.string().default('worker-internal'),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
