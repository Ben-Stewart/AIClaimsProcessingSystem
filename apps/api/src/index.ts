import { createServer } from 'http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { prisma } from './config/database.js';
import { initSocket } from './socket/index.js';

async function main() {
  const app = createApp();
  const httpServer = createServer(app);

  initSocket(httpServer);

  await prisma.$connect();
  console.log('Database connected');

  httpServer.listen(env.PORT ?? env.API_PORT, () => {
    console.log(`API running at ${env.API_URL}`);
  });

  const shutdown = async (signal: string) => {
    console.log(`${signal} received, shutting down...`);
    httpServer.close();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
