import { Job } from 'bullmq';
import { DocumentType, ExtractionStatus, WS_EVENTS, QUEUE_NAMES } from '@claims/shared';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/database.js';
import { analyzeWithAzureDI } from '../services/documentIntelligence.service.js';
import { analyzeImageWithGPT } from '../services/imageAnalysis.service.js';
import { getPresignedUrl } from '../services/storage.service.js';
import { emitJobEvent } from '../socket/emitter.js';
import { Queue } from 'bullmq';
import { redis } from '../config/redis.js';

const IMAGE_DOCUMENT_TYPES: DocumentType[] = [DocumentType.DAMAGE_PHOTO];

const claimPipelineQueue = new Queue(QUEUE_NAMES.CLAIM_PIPELINE, { connection: redis });

export async function processDocumentAnalysis(job: Job) {
  const { documentId, claimId, documentType } = job.data as {
    documentId: string;
    claimId: string;
    documentType: DocumentType;
  };

  emitJobEvent(claimId, WS_EVENTS.AI_JOB_STARTED, { jobId: job.id!, claimId, type: 'document_analysis' });

  await prisma.document.update({
    where: { id: documentId },
    data: { extractionStatus: ExtractionStatus.PROCESSING },
  });

  try {
    const document = await prisma.document.findUnique({ where: { id: documentId } });
    if (!document) throw new Error(`Document ${documentId} not found`);

    await job.updateProgress(20);
    emitJobEvent(claimId, WS_EVENTS.AI_JOB_PROGRESS, { jobId: job.id!, claimId, progress: 20, stage: 'Retrieving document' });

    const fileUrl = await getPresignedUrl(document.storageKey);

    await job.updateProgress(40);
    emitJobEvent(claimId, WS_EVENTS.AI_JOB_PROGRESS, { jobId: job.id!, claimId, progress: 40, stage: 'Extracting content' });

    let extractedData: Record<string, unknown>;
    let confidence: number;

    if (IMAGE_DOCUMENT_TYPES.includes(documentType)) {
      const result = await analyzeImageWithGPT(fileUrl, documentType, claimId);
      extractedData = result.data;
      confidence = result.confidence;
    } else {
      const result = await analyzeWithAzureDI(fileUrl, documentType);
      extractedData = result.data;
      confidence = result.confidence;
    }

    await job.updateProgress(90);
    emitJobEvent(claimId, WS_EVENTS.AI_JOB_PROGRESS, { jobId: job.id!, claimId, progress: 90, stage: 'Saving results' });

    await prisma.document.update({
      where: { id: documentId },
      data: {
        extractionStatus: ExtractionStatus.COMPLETE,
        extractedData: extractedData as Prisma.InputJsonValue,
        extractionConfidence: confidence,
      },
    });

    await prisma.auditEvent.create({
      data: {
        claimId,
        actorType: 'AI_SYSTEM',
        action: 'DOCUMENT_ANALYZED',
        details: { documentId, documentType, confidence },
      },
    });

    // Check if all documents for this claim are processed
    const pendingDocs = await prisma.document.count({
      where: {
        claimId,
        extractionStatus: { in: [ExtractionStatus.PENDING, ExtractionStatus.PROCESSING] },
      },
    });

    if (pendingDocs === 0) {
      await claimPipelineQueue.add('run', { claimId }, { attempts: 2 });
    }

    emitJobEvent(claimId, WS_EVENTS.AI_JOB_COMPLETED, {
      jobId: job.id!,
      claimId,
      type: 'document_analysis',
      resultSummary: `Extracted ${Object.keys(extractedData).length} fields with ${Math.round(confidence * 100)}% confidence`,
    });
  } catch (err) {
    await prisma.document.update({
      where: { id: documentId },
      data: {
        extractionStatus: ExtractionStatus.FAILED,
        extractionError: err instanceof Error ? err.message : 'Unknown error',
      },
    });

    emitJobEvent(claimId, WS_EVENTS.AI_JOB_FAILED, {
      jobId: job.id!,
      claimId,
      error: err instanceof Error ? err.message : 'Document analysis failed',
    });

    throw err;
  }
}
