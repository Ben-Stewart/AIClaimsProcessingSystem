import OpenAI from 'openai';
import { DamageSeverity } from '@claims/shared';
import { prisma } from '../config/database.js';
import { env } from '../config/env.js';

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

export async function runDamageAssessment(claimId: string): Promise<void> {
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
          'You are an expert insurance damage assessor. Analyze claim documents and produce a structured damage assessment. Return JSON only.',
      },
      {
        role: 'user',
        content: `Claim type: ${claim.incidentType}
Description: ${claim.incidentDescription}
Policy coverage limit: $${claim.policy.coverageLimit}
Deductible: $${claim.policy.deductible}

Extracted document data:
${JSON.stringify(documentSummaries, null, 2)}

Return JSON:
{
  "damageSeverity": "MINOR|MODERATE|SEVERE|TOTAL_LOSS",
  "estimatedRepairCost": number or null,
  "damageCategories": [{"category": string, "description": string, "confidence": number}],
  "coverageApplicable": boolean,
  "coverageReason": string,
  "overallConfidence": number between 0 and 1,
  "adjusterSummary": string
}`,
      },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 800,
  });

  const result = JSON.parse(response.choices[0]?.message?.content ?? '{}') as {
    damageSeverity: DamageSeverity;
    estimatedRepairCost: number | null;
    damageCategories: Array<{ category: string; description: string; confidence: number }>;
    coverageApplicable: boolean;
    coverageReason: string;
    overallConfidence: number;
  };

  const startTime = Date.now();

  await prisma.aIAssessment.upsert({
    where: { claimId },
    create: {
      claimId,
      damageSeverity: result.damageSeverity ?? DamageSeverity.MODERATE,
      estimatedRepairCost: result.estimatedRepairCost,
      damageCategories: result.damageCategories ?? [],
      comparableClaims: [],
      coverageApplicable: result.coverageApplicable ?? true,
      coverageReason: result.coverageReason ?? 'Coverage determination pending',
      overallConfidence: result.overallConfidence ?? 0.8,
      processingTimeMs: Date.now() - startTime,
      modelVersions: { gpt: 'gpt-4o' },
    },
    update: {
      damageSeverity: result.damageSeverity ?? DamageSeverity.MODERATE,
      estimatedRepairCost: result.estimatedRepairCost,
      damageCategories: result.damageCategories ?? [],
      coverageApplicable: result.coverageApplicable ?? true,
      coverageReason: result.coverageReason ?? 'Coverage determination pending',
      overallConfidence: result.overallConfidence ?? 0.8,
      processingTimeMs: Date.now() - startTime,
    },
  });

  await prisma.auditEvent.create({
    data: {
      claimId,
      actorType: 'AI_SYSTEM',
      action: 'DAMAGE_ASSESSED',
      details: {
        severity: result.damageSeverity,
        estimatedCost: result.estimatedRepairCost,
        confidence: result.overallConfidence,
      },
    },
  });
}
