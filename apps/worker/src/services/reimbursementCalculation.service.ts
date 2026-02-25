import OpenAI from 'openai';
import { prisma } from '../config/database.js';
import { env } from '../config/env.js';

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

export async function runReimbursementCalculation(claimId: string): Promise<void> {
  const claim = await prisma.claim.findUnique({
    where: { id: claimId },
    include: {
      policy: true,
      aiAssessment: true,
      documents: { where: { extractionStatus: 'COMPLETE' } },
    },
  });

  if (!claim) throw new Error(`Claim ${claimId} not found`);
  if (!claim.aiAssessment) throw new Error(`No AI assessment for claim ${claimId}`);

  // Find comparable paid claims
  const comparables = await prisma.claim.findMany({
    where: {
      serviceType: claim.serviceType,
      status: 'PAID',
      id: { not: claimId },
    },
    include: {
      reimbursementRecommendation: true,
      aiAssessment: true,
    },
    take: 10,
    orderBy: { createdAt: 'desc' },
  });

  const comparableData = comparables
    .filter((c) => c.reimbursementRecommendation?.adjusterDecision)
    .map((c) => ({
      serviceType: c.serviceType,
      claimSeverity: c.aiAssessment?.claimSeverity,
      reimbursementAmount: Number(c.reimbursementRecommendation!.adjusterDecision),
    }));

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content:
          'You are an expert medical benefits reimbursement analyst. Calculate a fair reimbursement range based on the claim data and comparable reimbursements. Return JSON only.',
      },
      {
        role: 'user',
        content: `Claim details:
- Type: ${claim.serviceType}
- Claim severity: ${claim.aiAssessment.claimSeverity}
- Estimated treatment cost: $${claim.aiAssessment.estimatedTreatmentCost ?? 'unknown'}
- Reasonable & customary limit for this service: $${(claim.policy.reasonableAndCustomary as Record<string, number>)[claim.serviceType] ?? 'not specified'}
- Reimbursement rate: ${Math.round(Number(claim.policy.percentCovered) * 100)}%
- Annual maximum: $${claim.policy.coverageLimit}
- Deductible: $${claim.policy.deductible}
- Coverage applicable: ${claim.aiAssessment.coverageApplicable}

Comparable paid claims: ${JSON.stringify(comparableData)}

Return JSON:
{
  "recommendedAmount": number,
  "rangeLow": number,
  "rangeHigh": number,
  "methodology": "clear explanation of how the amount was calculated",
  "confidence": number between 0 and 1
}

Calculate as: min(estimated cost, R&C limit) × reimbursement rate, minus deductible. Do not exceed annual maximum.`,
      },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 600,
  });

  const result = JSON.parse(response.choices[0]?.message?.content ?? '{}') as {
    recommendedAmount: number;
    rangeLow: number;
    rangeHigh: number;
    methodology: string;
    confidence: number;
  };

  await prisma.reimbursementRecommendation.upsert({
    where: { claimId },
    create: {
      claimId,
      recommendedAmount: result.recommendedAmount,
      rangeLow: result.rangeLow,
      rangeHigh: result.rangeHigh,
      methodology: result.methodology,
      comparableCount: comparableData.length,
      confidence: result.confidence ?? 0.8,
    },
    update: {
      recommendedAmount: result.recommendedAmount,
      rangeLow: result.rangeLow,
      rangeHigh: result.rangeHigh,
      methodology: result.methodology,
      comparableCount: comparableData.length,
      confidence: result.confidence ?? 0.8,
    },
  });

  await prisma.auditEvent.create({
    data: {
      claimId,
      actorType: 'AI_SYSTEM',
      action: 'REIMBURSEMENT_CALCULATED',
      details: {
        recommended: result.recommendedAmount,
        range: { low: result.rangeLow, high: result.rangeHigh },
        comparableCount: comparableData.length,
      },
    },
  });
}
