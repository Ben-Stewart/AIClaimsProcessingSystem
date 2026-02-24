import OpenAI from 'openai';
import { prisma } from '../config/database.js';
import { env } from '../config/env.js';

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

export async function runSettlementCalculation(claimId: string): Promise<void> {
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

  // Find comparable settled claims
  const comparables = await prisma.claim.findMany({
    where: {
      incidentType: claim.incidentType,
      status: 'SETTLED',
      id: { not: claimId },
    },
    include: {
      settlementRecommendation: true,
      aiAssessment: true,
    },
    take: 10,
    orderBy: { createdAt: 'desc' },
  });

  const comparableData = comparables
    .filter((c) => c.settlementRecommendation?.adjusterDecision)
    .map((c) => ({
      incidentType: c.incidentType,
      damageSeverity: c.aiAssessment?.damageSeverity,
      settlementAmount: Number(c.settlementRecommendation!.adjusterDecision),
    }));

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content:
          'You are an expert insurance settlement analyst. Calculate a fair settlement range based on the claim data and comparable settlements. Return JSON only.',
      },
      {
        role: 'user',
        content: `Claim details:
- Type: ${claim.incidentType}
- Damage severity: ${claim.aiAssessment.damageSeverity}
- Estimated repair cost: $${claim.aiAssessment.estimatedRepairCost ?? 'unknown'}
- Coverage limit: $${claim.policy.coverageLimit}
- Deductible: $${claim.policy.deductible}
- Coverage applicable: ${claim.aiAssessment.coverageApplicable}

Comparable settled claims: ${JSON.stringify(comparableData)}

Return JSON:
{
  "recommendedAmount": number,
  "rangeLow": number,
  "rangeHigh": number,
  "methodology": "clear explanation of how the amount was calculated",
  "confidence": number between 0 and 1
}

Ensure amounts account for the deductible. Do not exceed coverage limit.`,
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

  await prisma.settlementRecommendation.upsert({
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
      action: 'SETTLEMENT_CALCULATED',
      details: {
        recommended: result.recommendedAmount,
        range: { low: result.rangeLow, high: result.rangeHigh },
        comparableCount: comparableData.length,
      },
    },
  });
}
