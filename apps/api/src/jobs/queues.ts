import { Queue } from 'bullmq';
import { QUEUE_NAMES, JOB_PRIORITIES, DocumentType } from '@claims/shared';
import { redis } from '../config/redis.js';

const connection = redis;

export const documentAnalysisQueue = new Queue(QUEUE_NAMES.DOCUMENT_ANALYSIS, { connection });
export const claimPipelineQueue = new Queue(QUEUE_NAMES.CLAIM_PIPELINE, { connection });
export const fraudDetectionQueue = new Queue(QUEUE_NAMES.FRAUD_DETECTION, { connection });
export const reimbursementQueue = new Queue(QUEUE_NAMES.REIMBURSEMENT_CALCULATION, { connection });

export async function enqueueDocumentAnalysis(
  documentId: string,
  claimId: string,
  documentType: DocumentType,
) {
  return documentAnalysisQueue.add(
    'analyze',
    { documentId, claimId, documentType },
    {
      priority: JOB_PRIORITIES.NORMAL,
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 50 },
    },
  );
}

export async function enqueuePipeline(
  claimId: string,
  priority: keyof typeof JOB_PRIORITIES = 'NORMAL',
) {
  return claimPipelineQueue.add(
    'run',
    { claimId },
    {
      priority: JOB_PRIORITIES[priority],
      attempts: 2,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 50 },
    },
  );
}
