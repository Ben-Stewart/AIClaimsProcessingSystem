import { Job } from 'bullmq';
import { ClaimStatus, WS_EVENTS } from '@claims/shared';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/database.js';
import { emitJobEvent } from '../socket/emitter.js';
import { runFraudDetection } from '../services/fraudDetection.service.js';
import { runBenefitAssessment } from '../services/benefitAssessment.service.js';
import { runReimbursementCalculation } from '../services/reimbursementCalculation.service.js';

export async function processClaimPipeline(job: Job) {
  const { claimId } = job.data as { claimId: string };

  emitJobEvent(claimId, WS_EVENTS.AI_JOB_STARTED, { jobId: job.id!, claimId, type: 'claim_pipeline' });

  await prisma.claim.update({
    where: { id: claimId },
    data: { status: ClaimStatus.AI_PROCESSING },
  });

  try {
    // Stage 1: Run fraud detection and benefit assessment in parallel
    await job.updateProgress(10);
    emitJobEvent(claimId, WS_EVENTS.AI_JOB_PROGRESS, { jobId: job.id!, claimId, progress: 10, stage: 'Verifying coverage' });

    await Promise.all([
      runFraudDetection(claimId),
      runBenefitAssessment(claimId),
    ]);

    await job.updateProgress(70);
    emitJobEvent(claimId, WS_EVENTS.AI_JOB_PROGRESS, { jobId: job.id!, claimId, progress: 70, stage: 'Calculating reimbursement' });

    // Stage 2: Reimbursement calculation depends on assessment results
    await runReimbursementCalculation(claimId);

    await job.updateProgress(95);
    emitJobEvent(claimId, WS_EVENTS.AI_JOB_PROGRESS, { jobId: job.id!, claimId, progress: 95, stage: 'Finalizing' });

    // Check for auto-approval: LOW fraud risk + reimbursement under threshold
    const [fraud, reimbursement] = await Promise.all([
      prisma.fraudAnalysis.findUnique({ where: { claimId } }),
      prisma.reimbursementRecommendation.findUnique({ where: { claimId } }),
    ]);

    const threshold = Number(process.env.AUTO_APPROVE_THRESHOLD ?? 500);
    const autoApprove =
      fraud?.riskLevel === 'LOW' &&
      reimbursement?.recommendedAmount != null &&
      Number(reimbursement.recommendedAmount) <= threshold;

    if (autoApprove) {
      await prisma.claim.update({
        where: { id: claimId },
        data: { status: ClaimStatus.APPROVED, lossAmount: reimbursement!.recommendedAmount },
      });

      await prisma.auditEvent.create({
        data: {
          claimId,
          actorType: 'AI_SYSTEM',
          action: 'AUTO_APPROVED',
          details: {
            reason: 'Low fraud risk and reimbursement within auto-approve threshold',
            riskLevel: fraud!.riskLevel,
            amount: String(reimbursement!.recommendedAmount),
            threshold,
          } as Prisma.InputJsonValue,
        },
      });

      emitJobEvent(claimId, WS_EVENTS.CLAIM_UPDATED, { claimId, status: ClaimStatus.APPROVED });
      emitJobEvent(claimId, WS_EVENTS.AI_JOB_COMPLETED, {
        jobId: job.id!,
        claimId,
        type: 'claim_pipeline',
        resultSummary: `Claim automatically approved for $${Number(reimbursement!.recommendedAmount).toFixed(2)}.`,
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
        details: { stages: ['fraud_detection', 'benefit_assessment', 'reimbursement_calculation'] } as Prisma.InputJsonValue,
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
