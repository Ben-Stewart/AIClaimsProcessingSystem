import OpenAI from 'openai';
import { DocumentType } from '@claims/shared';
import { env } from '../config/env.js';

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

export async function analyzeDocumentWithGPT(
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
  switch (documentType) {
    case DocumentType.RECEIPT:
      return `You are an insurance claims processor reviewing a receipt for a health/benefits claim.
Carefully examine for signs of alteration: smudges, erasures, whiteout, ink inconsistencies, altered digits, or misaligned text.
Extract all relevant information and return a JSON object with:
{
  "vendorName": "name of the provider or business",
  "vendorAddress": "address if visible",
  "serviceDate": "date of service (YYYY-MM-DD)",
  "receiptDate": "date on receipt if different from service date",
  "totalAmount": total as a number,
  "lineItems": [{ "description": "...", "amount": number }],
  "paymentMethod": "cash/credit/debit/insurance if visible",
  "receiptNumber": "receipt or invoice number if present",
  "documentQuality": "GOOD | FAIR | SUSPICIOUS",
  "tamperingIndicators": ["describe any smudges, erasures, whiteout, inconsistent fonts, corrected amounts or dates — empty array if none"],
  "confidence": confidence percentage 0-100
}
Use null for fields not visible. Be precise with amounts.`;

    case DocumentType.INVOICE:
      return `You are an insurance claims processor reviewing a medical or service invoice.
Carefully examine for signs of alteration: smudges, erasures, whiteout, ink inconsistencies, altered digits, or misaligned text.
Extract all relevant information and return a JSON object with:
{
  "providerName": "name of the provider or clinic",
  "providerAddress": "address if visible",
  "npiNumber": "NPI if present",
  "patientName": "patient name if visible",
  "serviceDate": "date of service (YYYY-MM-DD)",
  "invoiceDate": "invoice date (YYYY-MM-DD)",
  "invoiceNumber": "invoice or claim number",
  "lineItems": [{ "description": "...", "code": "procedure code if present", "amount": number }],
  "subtotal": number or null,
  "totalAmount": total as a number,
  "icdCodes": ["diagnosis codes if present"],
  "documentQuality": "GOOD | FAIR | SUSPICIOUS",
  "tamperingIndicators": ["describe any smudges, erasures, whiteout, inconsistent fonts, corrected amounts or dates — empty array if none"],
  "confidence": confidence percentage 0-100
}
Use null for fields not visible.`;

    case DocumentType.MEDICAL_RECORD:
      return `You are an insurance claims processor reviewing a medical record.
Carefully examine for signs of alteration: smudges, erasures, whiteout, ink inconsistencies, altered digits, or misaligned text.
Extract all relevant information and return a JSON object with:
{
  "providerName": "treating provider name",
  "clinicName": "clinic or hospital name",
  "patientName": "patient name if visible",
  "visitDate": "date of visit (YYYY-MM-DD)",
  "chiefComplaint": "reason for visit",
  "diagnosis": "diagnosis or condition",
  "icdCodes": ["ICD-10 codes if present"],
  "treatment": "treatment provided",
  "followUpRequired": true or false or null,
  "documentQuality": "GOOD | FAIR | SUSPICIOUS",
  "tamperingIndicators": ["describe any smudges, erasures, whiteout, inconsistent fonts, corrected amounts or dates — empty array if none"],
  "confidence": confidence percentage 0-100
}
Use null for fields not visible.`;

    case DocumentType.REFERRAL_LETTER:
      return `You are an insurance claims processor reviewing a referral letter.
Carefully examine for signs of alteration: smudges, erasures, whiteout, ink inconsistencies, altered digits, or misaligned text.
Extract all relevant information and return a JSON object with:
{
  "referringProvider": "name of referring physician",
  "referredTo": "specialist or service being referred to",
  "referralDate": "date of referral (YYYY-MM-DD)",
  "patientName": "patient name if visible",
  "reason": "reason for referral",
  "urgency": "routine/urgent/emergent if indicated",
  "referralNumber": "referral number if present",
  "expiryDate": "referral expiry date if present (YYYY-MM-DD)",
  "documentQuality": "GOOD | FAIR | SUSPICIOUS",
  "tamperingIndicators": ["describe any smudges, erasures, whiteout, inconsistent fonts, corrected amounts or dates — empty array if none"],
  "confidence": confidence percentage 0-100
}
Use null for fields not visible.`;

    case DocumentType.TREATMENT_PLAN:
      return `You are an insurance claims processor reviewing a treatment plan.
Carefully examine for signs of alteration: smudges, erasures, whiteout, ink inconsistencies, altered digits, or misaligned text.
Extract all relevant information and return a JSON object with:
{
  "providerName": "provider or clinic name",
  "patientName": "patient name if visible",
  "dateIssued": "date issued (YYYY-MM-DD)",
  "diagnosis": "condition being treated",
  "plannedTreatments": ["list of planned treatments or sessions"],
  "estimatedSessions": number or null,
  "estimatedCostPerSession": number or null,
  "totalEstimatedCost": number or null,
  "duration": "duration of treatment plan if stated",
  "documentQuality": "GOOD | FAIR | SUSPICIOUS",
  "tamperingIndicators": ["describe any smudges, erasures, whiteout, inconsistent fonts, corrected amounts or dates — empty array if none"],
  "confidence": confidence percentage 0-100
}
Use null for fields not visible.`;

    case DocumentType.EXPLANATION_OF_BENEFITS:
      return `You are an insurance claims processor reviewing an Explanation of Benefits (EOB) document.
Extract all relevant information and return a JSON object with:
{
  "insurerName": "insurance company name",
  "memberName": "member name if visible",
  "memberId": "member/policy ID",
  "claimNumber": "claim number",
  "serviceDate": "date of service (YYYY-MM-DD)",
  "providerName": "service provider",
  "billedAmount": number,
  "allowedAmount": number or null,
  "planPaid": number or null,
  "memberResponsibility": number or null,
  "deductibleApplied": number or null,
  "status": "paid/pending/denied",
  "confidence": confidence percentage 0-100
}
Use null for fields not visible.`;

    case DocumentType.INSURANCE_CARD:
      return `You are an insurance claims processor reviewing an insurance card.
Extract all relevant information and return a JSON object with:
{
  "insurerName": "insurance company name",
  "planName": "plan name if visible",
  "memberId": "member ID number",
  "memberName": "member name",
  "groupNumber": "group number if present",
  "effectiveDate": "effective date if visible (YYYY-MM-DD)",
  "copay": "copay amounts if listed",
  "rxBin": "prescription BIN number if present",
  "customerServicePhone": "phone number if visible",
  "confidence": confidence percentage 0-100
}
Use null for fields not visible.`;

    default:
      return `You are an insurance claims processor reviewing a document.
Extract all relevant information visible in this document and return it as a JSON object.
Include a "confidence" field (percentage 0-100) indicating your confidence in the extraction.
Focus on dates, amounts, names, and reference numbers.`;
  }
}
