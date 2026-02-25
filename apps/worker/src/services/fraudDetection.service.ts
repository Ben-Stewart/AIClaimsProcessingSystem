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
    (claim.serviceDate.getTime() - claim.policy.effectiveDate.getTime()) / (1000 * 60 * 60 * 24);

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

  // ─── R&C amount check ─────────────────────────────────────────
  const rcLimits = claim.policy.reasonableAndCustomary as Record<string, number>;
  const rcLimit = rcLimits[claim.serviceType];
  const requested = Number(claim.lossAmount ?? 0);

  if (rcLimit && requested > 0) {
    const multiple = requested / rcLimit;
    if (multiple > 2.5) {
      signals.push({
        factor: 'excessive_amount',
        weight: 0.25,
        description: `Requested amount ($${requested}) is ${multiple.toFixed(1)}× the R&C limit ($${rcLimit}) for ${claim.serviceType} — excessive`,
      });
    } else if (multiple > 1.5) {
      signals.push({
        factor: 'high_amount',
        weight: 0.15,
        description: `Requested amount ($${requested}) is ${multiple.toFixed(1)}× the R&C limit ($${rcLimit}) for ${claim.serviceType} — high`,
      });
    } else if (multiple > 1.0) {
      signals.push({
        factor: 'elevated_amount',
        weight: 0,
        description: `Requested amount ($${requested}) is ${multiple.toFixed(1)}× the R&C limit ($${rcLimit}) for ${claim.serviceType} — elevated (informational)`,
      });
    }
  }

  // ─── Round number billing ─────────────────────────────────────
  if (requested >= 100 && requested % 50 === 0) {
    signals.push({
      factor: 'round_number_billing',
      weight: 0.1,
      description: `Claimed amount ($${requested}) is a round number — common in fabricated invoices`,
    });
  }

  // ─── Name mismatch ────────────────────────────────────────────
  const holderName = claim.policy.holderName;
  const extractedNames = claim.documents
    .filter((d) => d.extractedData)
    .flatMap((d) => {
      const data = d.extractedData as Record<string, unknown>;
      return [data.patientName, data.memberName].filter(
        (n): n is string => typeof n === 'string' && n.trim().length > 0,
      );
    });

  if (extractedNames.length > 0 && extractedNames.every((n) => !namesMatch(n, holderName))) {
    signals.push({
      factor: 'name_mismatch',
      weight: 0.3,
      description: `Patient name on documents ("${extractedNames[0]}") does not match policy holder ("${holderName}")`,
    });
  }

  // ─── Provider mismatch ────────────────────────────────────────
  const claimedProvider = claim.provider as { name?: string; address?: string; phone?: string } | null;

  if (claimedProvider?.name) {
    const docProviderNames = claim.documents
      .filter((d) => d.extractedData)
      .flatMap((d) => {
        const data = d.extractedData as Record<string, unknown>;
        return [data.providerName, data.vendorName, data.clinicName].filter(
          (n): n is string => typeof n === 'string' && n.trim().length > 0,
        );
      });

    if (docProviderNames.length > 0 && docProviderNames.every((n) => !namesMatch(n, claimedProvider.name!))) {
      signals.push({
        factor: 'provider_mismatch',
        weight: 0.25,
        description: `Provider on documents ("${docProviderNames[0]}") does not match claimed provider ("${claimedProvider.name}")`,
      });
    }
  }

  // ─── Date inconsistency ───────────────────────────────────────
  const extractedDates = claim.documents
    .filter((d) => d.extractedData)
    .flatMap((d) => {
      const data = d.extractedData as Record<string, unknown>;
      return ['serviceDate', 'visitDate', 'invoiceDate', 'receiptDate', 'referralDate', 'dateIssued']
        .map((k) => data[k])
        .filter((v): v is string => typeof v === 'string' && v.length > 0);
    });

  const hasDateMismatch = extractedDates.some((dateStr) => {
    try {
      const diff =
        Math.abs(new Date(dateStr).getTime() - claim.serviceDate.getTime()) / 86_400_000;
      return diff > 7;
    } catch {
      return false;
    }
  });

  if (extractedDates.length > 0 && hasDateMismatch) {
    signals.push({
      factor: 'date_inconsistency',
      weight: 0.25,
      description: `Service date on documents does not match claimed service date (${claim.serviceDate.toISOString().slice(0, 10)})`,
    });
  }

  // ─── Document tampering ───────────────────────────────────────
  const tamperedDocs = claim.documents.filter((d) => {
    if (!d.extractedData) return false;
    const data = d.extractedData as Record<string, unknown>;
    return (
      data.documentQuality === 'SUSPICIOUS' ||
      (Array.isArray(data.tamperingIndicators) && data.tamperingIndicators.length > 0)
    );
  });

  if (tamperedDocs.length > 0) {
    const indicators = tamperedDocs.flatMap((d) => {
      const data = d.extractedData as Record<string, unknown>;
      return Array.isArray(data.tamperingIndicators) ? (data.tamperingIndicators as string[]) : [];
    });
    signals.push({
      factor: 'document_tampering',
      weight: 0.35,
      description: `Potential tampering in ${tamperedDocs.length} document(s): ${indicators.slice(0, 2).join('; ')}`,
    });
  }

  // ─── Duplicate document ───────────────────────────────────────
  const docNumbers = claim.documents
    .filter((d) => d.extractedData)
    .flatMap((d) => {
      const data = d.extractedData as Record<string, unknown>;
      return [data.invoiceNumber, data.receiptNumber].filter(
        (n): n is string => typeof n === 'string' && n.trim().length > 0,
      );
    });

  for (const docNumber of docNumbers) {
    const duplicate =
      (await prisma.document.findFirst({
        where: {
          claimId: { not: claimId },
          extractedData: { path: ['invoiceNumber'], equals: docNumber },
        },
      })) ??
      (await prisma.document.findFirst({
        where: {
          claimId: { not: claimId },
          extractedData: { path: ['receiptNumber'], equals: docNumber },
        },
      }));

    if (duplicate) {
      signals.push({
        factor: 'duplicate_document',
        weight: 0.35,
        description: `Document number "${docNumber}" has already been submitted on another claim`,
      });
      break;
    }
  }

  // ─── Future-dated document ────────────────────────────────────
  const now = new Date();
  const hasFutureDate = claim.documents.some((d) => {
    if (!d.extractedData) return false;
    const data = d.extractedData as Record<string, unknown>;
    return ['serviceDate', 'visitDate', 'invoiceDate', 'receiptDate'].some((k) => {
      const v = data[k];
      if (typeof v !== 'string') return false;
      try {
        return new Date(v) > now;
      } catch {
        return false;
      }
    });
  });

  if (hasFutureDate) {
    signals.push({
      factor: 'future_dated_document',
      weight: 0.3,
      description: 'One or more documents contain a date in the future',
    });
  }

  // ─── LLM narrative consistency check ─────────────────────────
  const extractedTexts = claim.documents
    .map((d) => JSON.stringify(d.extractedData))
    .join('\n\n');

  if (extractedTexts.length > 0) {
    const narrativeCheck = await checkNarrativeConsistency(claim, extractedTexts);
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
  claim: {
    serviceDescription: string | null | undefined;
    serviceDate: Date;
    serviceType: string;
    lossAmount: unknown;
    policy: { holderName: string };
  },
  documentData: string,
): Promise<{ hasInconsistencies: boolean; signals: FraudSignal[] }> {
  if (!claim.serviceDescription) {
    return { hasInconsistencies: false, signals: [] };
  }

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content:
          'You are an insurance fraud analyst. Compare the claim details against extracted document data to find inconsistencies. Return JSON only.',
      },
      {
        role: 'user',
        content: `Policy holder: ${claim.policy.holderName}
Claimed service date: ${claim.serviceDate.toISOString().slice(0, 10)}
Claimed amount: $${Number(claim.lossAmount ?? 0)}
Service type: ${claim.serviceType}
Claim narrative: ${claim.serviceDescription}

Extracted document data:
${documentData}

Check specifically for: (1) patient/member name mismatches vs policy holder, (2) date mismatches vs claimed service date, (3) amount discrepancies, (4) service type inconsistencies vs claimed service type.
Return JSON: { "hasInconsistencies": boolean, "inconsistencies": [{"description": string, "severity": "LOW"|"MEDIUM"|"HIGH"}] }`,
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
  if (score >= 0.25) return FraudRecommendation.FLAG_FOR_REVIEW;
  return FraudRecommendation.APPROVE;
}

function namesMatch(a: string, b: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[.,]/g, '').trim();
  const na = norm(a);
  const nb = norm(b);
  if (na === nb || na.includes(nb) || nb.includes(na)) return true;
  const lastA = na.split(' ').at(-1) ?? '';
  const lastB = nb.split(' ').at(-1) ?? '';
  return lastA.length > 1 && lastA === lastB;
}
