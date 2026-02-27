import OpenAI from 'openai';
import { ClaimSeverity } from '@claims/shared';
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
          'You are an expert paramedical and dental benefits assessor. Analyze claim documents and produce a structured benefits assessment. Return JSON only.',
      },
      {
        role: 'user',
        content: `Claim type: ${claim.serviceType}
${claim.serviceDescription ? `Description: ${claim.serviceDescription}\n` : ''}Policy coverage limit: $${claim.policy.coverageLimit}
Deductible: $${claim.policy.deductible}

Extracted document data:
${JSON.stringify(documentSummaries, null, 2)}

Return JSON:
{
  "claimSeverity": "MINOR|MODERATE|SEVERE|CATASTROPHIC",
  "estimatedTreatmentCost": number or null,
  "treatmentCategories": [{"category": string, "description": string, "confidence": number}],
  "coverageApplicable": boolean,
  "coverageReason": string,
  "overallConfidence": number between 0 and 1,
  "severityRationale": "1-2 sentences explaining why this severity level was chosen based on the documents",
  "confidenceRationale": "1-2 sentences explaining what drove this confidence score — what was clear and what was uncertain",
  "adjusterSummary": string
}`,
      },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 800,
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
