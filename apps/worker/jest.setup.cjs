// Set required environment variables before any test modules are loaded.
// This prevents env.ts from calling process.exit(1) during tests.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.OPENAI_API_KEY = 'sk-test-key-placeholder';
