import OpenAI from 'openai';
import { RiskLevel, FraudRecommendation, RISK_THRESHOLDS } from '@claims/shared';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/database.js';
import { env } from '../config/env.js';

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

interface FraudSignal {
  factor: string;
  weight: number;
  description: string;
}

export async function runFraudDetection(claimId: string): Promise<void> {
  const claim = await prisma.claim.findUnique({
    where: { id: claimId },
    include: {
      policy: true,
      documents: { where: { extractionStatus: 'COMPLETE' } },
    },
  });

  if (!claim) throw new Error(`Claim ${claimId} not found`);

  const signals: FraudSignal[] = [];

  // ─── Rule-based signals ───────────────────────────────────────
  const policyAgeDays =
    (claim.incidentDate.getTime() - claim.policy.effectiveDate.getTime()) / (1000 * 60 * 60 * 24);

  if (policyAgeDays < 30) {
    signals.push({
      factor: 'early_claim',
      weight: 0.3,
      description: `Claim filed ${Math.round(policyAgeDays)} days after policy inception (threshold: 30 days)`,
    });
  }

  const priorClaims = await prisma.claim.count({
    where: {
      policyId: claim.policyId,
      id: { not: claimId },
      createdAt: { gte: new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000) },
    },
  });

  if (priorClaims >= 2) {
    signals.push({
      factor: 'multiple_claims',
      weight: 0.2,
      description: `${priorClaims} prior claims on this policy in the past 24 months`,
    });
  }

  // ─── LLM narrative consistency check ─────────────────────────
  const extractedTexts = claim.documents
    .map((d) => JSON.stringify(d.extractedData))
    .join('\n\n');

  if (extractedTexts.length > 0) {
    const narrativeCheck = await checkNarrativeConsistency(
      claim.incidentDescription,
      extractedTexts,
    );
    if (narrativeCheck.hasInconsistencies) {
      signals.push(...narrativeCheck.signals);
    }
  }

  // ─── Compute composite risk score ────────────────────────────
  const riskScore = Math.min(
    signals.reduce((sum, s) => sum + s.weight, 0),
    1.0,
  );

  const riskLevel = getRiskLevel(riskScore);
  const recommendation = getRecommendation(riskScore);

  await prisma.fraudAnalysis.upsert({
    where: { claimId },
    create: {
      claimId,
      riskScore,
      riskLevel,
      signals: signals as unknown as Prisma.InputJsonValue,
      anomalies: [] as unknown as Prisma.InputJsonValue,
      recommendation,
      confidence: 0.85,
    },
    update: {
      riskScore,
      riskLevel,
      signals: signals as unknown as Prisma.InputJsonValue,
      recommendation,
    },
  });

  await prisma.auditEvent.create({
    data: {
      claimId,
      actorType: 'AI_SYSTEM',
      action: 'FRAUD_SCORED',
      details: { riskScore, riskLevel, signalCount: signals.length },
    },
  });
}

async function checkNarrativeConsistency(
  narrative: string,
  documentData: string,
): Promise<{ hasInconsistencies: boolean; signals: FraudSignal[] }> {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content:
          'You are an insurance fraud analyst. Compare the claim narrative against extracted document data to find inconsistencies. Return JSON only.',
      },
      {
        role: 'user',
        content: `Claim narrative: ${narrative}\n\nExtracted document data: ${documentData}\n\nReturn JSON: { "hasInconsistencies": boolean, "inconsistencies": [{"description": string, "severity": "LOW"|"MEDIUM"|"HIGH"}] }`,
      },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 500,
  });

  const result = JSON.parse(response.choices[0]?.message?.content ?? '{}') as {
    hasInconsistencies: boolean;
    inconsistencies: Array<{ description: string; severity: string }>;
  };

  const signals: FraudSignal[] = (result.inconsistencies ?? []).map((i) => ({
    factor: 'narrative_inconsistency',
    weight: i.severity === 'HIGH' ? 0.3 : i.severity === 'MEDIUM' ? 0.15 : 0.05,
    description: i.description,
  }));

  return { hasInconsistencies: result.hasInconsistencies ?? false, signals };
}

function getRiskLevel(score: number): RiskLevel {
  if (score >= RISK_THRESHOLDS[RiskLevel.CRITICAL].min) return RiskLevel.CRITICAL;
  if (score >= RISK_THRESHOLDS[RiskLevel.HIGH].min) return RiskLevel.HIGH;
  if (score >= RISK_THRESHOLDS[RiskLevel.MEDIUM].min) return RiskLevel.MEDIUM;
  return RiskLevel.LOW;
}

function getRecommendation(score: number): FraudRecommendation {
  if (score >= 0.7) return FraudRecommendation.ESCALATE_SIU;
  if (score >= 0.4) return FraudRecommendation.FLAG_FOR_REVIEW;
  return FraudRecommendation.APPROVE;
}
