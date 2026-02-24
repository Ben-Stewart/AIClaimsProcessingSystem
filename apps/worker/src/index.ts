import { Worker } from 'bullmq';
import { QUEUE_NAMES } from '@claims/shared';
import { redis } from './config/redis.js';
import { prisma } from './config/database.js';
import { processDocumentAnalysis } from './processors/documentAnalysis.processor.js';
import { processClaimPipeline } from './processors/claimPipeline.processor.js';

async function main() {
  await prisma.$connect();
  console.log('Worker database connected');

  const documentWorker = new Worker(
    QUEUE_NAMES.DOCUMENT_ANALYSIS,
    processDocumentAnalysis,
    { connection: redis, concurrency: 5 },
  );

  const pipelineWorker = new Worker(
    QUEUE_NAMES.CLAIM_PIPELINE,
    processClaimPipeline,
    { connection: redis, concurrency: 3 },
  );

  documentWorker.on('failed', (job, err) => {
    console.error(`Document analysis job ${job?.id} failed:`, err.message);
  });

  pipelineWorker.on('failed', (job, err) => {
    console.error(`Claim pipeline job ${job?.id} failed:`, err.message);
  });

  console.log('Workers started');
  console.log(`  - ${QUEUE_NAMES.DOCUMENT_ANALYSIS} (concurrency: 5)`);
  console.log(`  - ${QUEUE_NAMES.CLAIM_PIPELINE} (concurrency: 3)`);

  const shutdown = async (signal: string) => {
    console.log(`${signal} received, shutting down workers...`);
    await documentWorker.close();
    await pipelineWorker.close();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('Fatal worker error:', err);
  process.exit(1);
});
