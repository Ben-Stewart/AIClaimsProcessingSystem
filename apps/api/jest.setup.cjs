// Set required environment variables before any test modules are loaded.
// This prevents env.ts from calling process.exit(1) during tests.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.JWT_SECRET = 'test-secret-key-for-jest-at-least-32-chars';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-for-jest-minimum-32chars';
process.env.OPENAI_API_KEY = 'sk-test-key-placeholder';
