import { Job } from 'bullmq';
import { ClaimStatus, WS_EVENTS } from '@claims/shared';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/database.js';
import { emitJobEvent } from '../socket/emitter.js';
import { runFraudDetection } from '../services/fraudDetection.service.js';
import { runDamageAssessment } from '../services/damageAssessment.service.js';
import { runSettlementCalculation } from '../services/settlementPrediction.service.js';

export async function processClaimPipeline(job: Job) {
  const { claimId } = job.data as { claimId: string };

  emitJobEvent(claimId, WS_EVENTS.AI_JOB_STARTED, { jobId: job.id!, claimId, type: 'claim_pipeline' });

  await prisma.claim.update({
    where: { id: claimId },
    data: { status: ClaimStatus.AI_PROCESSING },
  });

  try {
    // Stage 1: Run fraud detection, coverage verification, and damage assessment in parallel
    await job.updateProgress(10);
    emitJobEvent(claimId, WS_EVENTS.AI_JOB_PROGRESS, { jobId: job.id!, claimId, progress: 10, stage: 'Verifying coverage' });

    await Promise.all([
      runFraudDetection(claimId),
      runDamageAssessment(claimId),
    ]);

    await job.updateProgress(70);
    emitJobEvent(claimId, WS_EVENTS.AI_JOB_PROGRESS, { jobId: job.id!, claimId, progress: 70, stage: 'Calculating settlement' });

    // Stage 2: Settlement depends on assessment results
    await runSettlementCalculation(claimId);

    await job.updateProgress(95);
    emitJobEvent(claimId, WS_EVENTS.AI_JOB_PROGRESS, { jobId: job.id!, claimId, progress: 95, stage: 'Finalizing' });

    // Check for auto-approval: LOW fraud risk + settlement under threshold
    const [fraud, settlement] = await Promise.all([
      prisma.fraudAnalysis.findUnique({ where: { claimId } }),
      prisma.settlementRecommendation.findUnique({ where: { claimId } }),
    ]);

    const threshold = Number(process.env.AUTO_APPROVE_THRESHOLD ?? 5000);
    const autoApprove =
      fraud?.riskLevel === 'LOW' &&
      settlement?.recommendedAmount != null &&
      Number(settlement.recommendedAmount) <= threshold;

    if (autoApprove) {
      await prisma.claim.update({
        where: { id: claimId },
        data: { status: ClaimStatus.APPROVED, lossAmount: settlement!.recommendedAmount },
      });

      await prisma.auditEvent.create({
        data: {
          claimId,
          actorType: 'AI_SYSTEM',
          action: 'AUTO_APPROVED',
          details: {
            reason: 'Low fraud risk and settlement within auto-approve threshold',
            riskLevel: fraud!.riskLevel,
            amount: String(settlement!.recommendedAmount),
            threshold,
          } as Prisma.InputJsonValue,
        },
      });

      emitJobEvent(claimId, WS_EVENTS.CLAIM_UPDATED, { claimId, status: ClaimStatus.APPROVED });
      emitJobEvent(claimId, WS_EVENTS.AI_JOB_COMPLETED, {
        jobId: job.id!,
        claimId,
        type: 'claim_pipeline',
        resultSummary: `Claim automatically approved for $${Number(settlement!.recommendedAmount).toFixed(2)}.`,
      });
      return;
    }

    await prisma.claim.update({
      where: { id: claimId },
      data: { status: ClaimStatus.PENDING_ADJUSTER_DECISION },
    });

    await prisma.auditEvent.create({
      data: {
        claimId,
        actorType: 'AI_SYSTEM',
        action: 'AI_PIPELINE_COMPLETE',
        details: { stages: ['fraud_detection', 'damage_assessment', 'settlement_calculation'] } as Prisma.InputJsonValue,
      },
    });

    emitJobEvent(claimId, WS_EVENTS.CLAIM_READY_FOR_REVIEW, { claimId });
    emitJobEvent(claimId, WS_EVENTS.AI_JOB_COMPLETED, {
      jobId: job.id!,
      claimId,
      type: 'claim_pipeline',
      resultSummary: 'AI analysis complete. Claim ready for adjuster review.',
    });
  } catch (err) {
    await prisma.claim.update({
      where: { id: claimId },
      data: { status: ClaimStatus.DOCUMENTS_UNDER_REVIEW },
    });

    emitJobEvent(claimId, WS_EVENTS.AI_JOB_FAILED, {
      jobId: job.id!,
      claimId,
      error: err instanceof Error ? err.message : 'Pipeline failed',
    });

    throw err;
  }
}
