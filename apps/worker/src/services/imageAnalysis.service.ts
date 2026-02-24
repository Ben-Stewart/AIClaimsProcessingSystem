import OpenAI from 'openai';
import { DocumentType, DamageSeverity } from '@claims/shared';
import { env } from '../config/env.js';

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

export async function analyzeImageWithGPT(
  imageUrl: string,
  documentType: DocumentType,
  claimId: string,
): Promise<{ data: Record<string, unknown>; confidence: number }> {
  const prompt = buildPrompt(documentType, claimId);

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: imageUrl, detail: 'high' } },
          { type: 'text', text: prompt },
        ],
      },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 1000,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error('No response from GPT-4o Vision');

  const parsed = JSON.parse(content) as Record<string, unknown>;
  const confidence = typeof parsed.confidence === 'number' ? parsed.confidence / 100 : 0.85;

  return { data: parsed, confidence };
}

function buildPrompt(documentType: DocumentType, _claimId: string): string {
  if (documentType === DocumentType.DAMAGE_PHOTO) {
    return `You are an expert insurance damage assessor reviewing a damage photo for a claim.

Analyze this image and return a JSON object with:
{
  "damageSeverity": "${DamageSeverity.MINOR} | ${DamageSeverity.MODERATE} | ${DamageSeverity.SEVERE} | ${DamageSeverity.TOTAL_LOSS}",
  "affectedAreas": ["list of damaged areas/components"],
  "damageDescription": "clear, professional description of the damage",
  "repairComplexity": "LOW | MEDIUM | HIGH",
  "estimatedRepairCost": estimated cost as a number or null if unable to estimate,
  "consistencyFlags": ["any inconsistencies or concerns noted"],
  "confidence": confidence percentage 0-100,
  "adjusterNotes": "brief note suitable for an insurance adjuster"
}

Be objective and professional. If you cannot determine something, use null.`;
  }

  return `Analyze this insurance document image and extract all relevant information as a JSON object. Include confidence as a percentage 0-100.`;
}
