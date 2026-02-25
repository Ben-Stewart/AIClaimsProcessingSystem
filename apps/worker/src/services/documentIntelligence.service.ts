import { DocumentAnalysisClient, AzureKeyCredential } from '@azure/ai-form-recognizer';
import { DocumentType } from '@claims/shared';
import { env } from '../config/env.js';

function getModelId(documentType: DocumentType): string {
  switch (documentType) {
    case DocumentType.INVOICE:
      return 'prebuilt-invoice';
    default:
      return 'prebuilt-document';
  }
}

export async function analyzeWithAzureDI(
  documentUrl: string,
  documentType: DocumentType,
): Promise<{ data: Record<string, unknown>; confidence: number }> {
  if (!env.AZURE_DI_ENDPOINT || !env.AZURE_DI_KEY) {
    // Return mock data if Azure DI is not configured (dev/demo mode)
    return getMockExtraction(documentType);
  }

  const client = new DocumentAnalysisClient(
    env.AZURE_DI_ENDPOINT,
    new AzureKeyCredential(env.AZURE_DI_KEY),
  );

  const modelId = getModelId(documentType);
  const poller = await client.beginAnalyzeDocumentFromUrl(modelId, documentUrl);
  const result = await poller.pollUntilDone();

  const doc = result.documents?.[0];
  const fields: Record<string, unknown> = {};
  let totalConfidence = 0;
  let fieldCount = 0;

  if (doc?.fields) {
    for (const [key, field] of Object.entries(doc.fields)) {
      fields[key] = (field as { value?: unknown; content?: unknown }).value ?? field.content;
      if (field.confidence !== undefined) {
        totalConfidence += field.confidence;
        fieldCount++;
      }
    }
  }

  return {
    data: fields,
    confidence: fieldCount > 0 ? totalConfidence / fieldCount : 0.8,
  };
}

function getMockExtraction(documentType: DocumentType): { data: Record<string, unknown>; confidence: number } {
  const mocks: Partial<Record<DocumentType, Record<string, unknown>>> = {
    [DocumentType.INVOICE]: {
      vendorName: 'City General Hospital',
      invoiceDate: '2024-02-22',
      invoiceTotal: 775.00,
      lineItems: [
        { description: 'Emergency Room Visit', amount: 450.00 },
        { description: 'X-Ray (cervical)', amount: 280.00 },
        { description: 'Cervical Collar', amount: 45.00 },
      ],
      icdCodes: ['S13.4XXA'],
      npiNumber: '1234567890',
    },
  };

  return {
    data: mocks[documentType] ?? { extracted: true, documentType },
    confidence: 0.93,
  };
}
