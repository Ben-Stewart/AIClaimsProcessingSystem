import OpenAI from 'openai';
import { ClaimSeverity } from '@claims/shared';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/database.js';
import { env } from '../config/env.js';

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

export async function runBenefitAssessment(claimId: string): Promise<void> {
  const claim = await prisma.claim.findUnique({
    where: { id: claimId },
    include: {
      policy: true,
      documents: { where: { extractionStatus: 'COMPLETE' } },
    },
  });

  if (!claim) throw new Error(`Claim ${claimId} not found`);

  const documentSummaries = claim.documents.map((d) => ({
    type: d.type,
    data: d.extractedData,
  }));

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content:
          'You are an expert paramedical and dental benefits assessor. Your job is to determine whether a claim is eligible for coverage under the plan and to assess medical necessity and billing reasonableness. Base coverage decisions only on plan eligibility, medical necessity, and billing appropriateness — not on document quality or fraud indicators. Return JSON only.',
      },
      {
        role: 'user',
        content: `Claim type: ${claim.serviceType}
${claim.serviceDescription ? `Description: ${claim.serviceDescription}\n` : ''}Policy coverage limit: $${claim.policy.coverageLimit}
Deductible: $${claim.policy.deductible}

Extracted document data:
${JSON.stringify(documentSummaries, null, 2)}

Return JSON with the following fields:
{
  "claimSeverity": "MINOR|MODERATE|SEVERE|CATASTROPHIC",
  "estimatedTreatmentCost": number or null,
  "treatmentCategories": [{"category": string, "description": string, "confidence": number}],
  "coverageApplicable": boolean,
  "coverageReason": "Explanation of the coverage decision based solely on plan eligibility and medical necessity. Do not reference document quality or fraud concerns here.",
  "overallConfidence": "number between 0 and 1 representing confidence in the COVERAGE DETERMINATION specifically — how certain are you that this claim is or is not covered under the plan?",
  "severityRationale": "1-2 sentences on the medical severity of the condition based on the claim type and description",
  "confidenceRationale": "1-2 sentences explaining what factors made the coverage determination clear or uncertain",
  "applicableEndorsements": {
    "medicalNecessity": boolean,
    "medicalNecessityRationale": "1-2 sentences: is this specific treatment warranted for the stated condition? Consider clinical appropriateness (e.g. physiotherapy for herniated disk = warranted; massage for relaxation = not warranted under most plans)",
    "amountReasonableness": "WITHIN_RANGE|ELEVATED|EXCESSIVE",
    "amountReasonablenessRationale": "1-2 sentences: is the claimed amount reasonable for this service type? Reference typical cost ranges for this treatment."
  }
}`,
      },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 1000,
  });

  const result = JSON.parse(response.choices[0]?.message?.content ?? '{}') as {
    claimSeverity: ClaimSeverity;
    estimatedTreatmentCost: number | null;
    treatmentCategories: Array<{ category: string; description: string; confidence: number }>;
    coverageApplicable: boolean;
    coverageReason: string;
    overallConfidence: number;
    severityRationale: string | null;
    confidenceRationale: string | null;
    applicableEndorsements: {
      medicalNecessity: boolean;
      medicalNecessityRationale: string;
      amountReasonableness: 'WITHIN_RANGE' | 'ELEVATED' | 'EXCESSIVE';
      amountReasonablenessRationale: string;
    } | null;
  };

  const startTime = Date.now();

  await prisma.aIAssessment.upsert({
    where: { claimId },
    create: {
      claimId,
      claimSeverity: result.claimSeverity ?? ClaimSeverity.MODERATE,
      estimatedTreatmentCost: result.estimatedTreatmentCost,
      treatmentCategories: result.treatmentCategories ?? [],
      comparableClaims: [],
      coverageApplicable: result.coverageApplicable ?? true,
      coverageReason: result.coverageReason ?? 'Coverage determination pending',
      overallConfidence: result.overallConfidence ?? 0.8,
      severityRationale: result.severityRationale ?? null,
      confidenceRationale: result.confidenceRationale ?? null,
      applicableEndorsements: (result.applicableEndorsements ?? null) as Prisma.InputJsonValue,
      processingTimeMs: Date.now() - startTime,
      modelVersions: { gpt: 'gpt-4o' },
    },
    update: {
      claimSeverity: result.claimSeverity ?? ClaimSeverity.MODERATE,
      estimatedTreatmentCost: result.estimatedTreatmentCost,
      treatmentCategories: result.treatmentCategories ?? [],
      coverageApplicable: result.coverageApplicable ?? true,
      coverageReason: result.coverageReason ?? 'Coverage determination pending',
      overallConfidence: result.overallConfidence ?? 0.8,
      severityRationale: result.severityRationale ?? null,
      confidenceRationale: result.confidenceRationale ?? null,
      applicableEndorsements: (result.applicableEndorsements ?? null) as Prisma.InputJsonValue,
      processingTimeMs: Date.now() - startTime,
    },
  });

  await prisma.auditEvent.create({
    data: {
      claimId,
      actorType: 'AI_SYSTEM',
      action: 'BENEFIT_ASSESSED',
      details: {
        severity: result.claimSeverity,
        estimatedCost: result.estimatedTreatmentCost,
        confidence: result.overallConfidence,
      },
    },
  });
}
