import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ─── Mock functions defined at module level (full jest.Mock capabilities) ────

const mockFindUnique = jest.fn();
const mockCount = jest.fn();
const mockDocFindFirst = jest.fn();
const mockUpsert = jest.fn();
const mockAuditCreate = jest.fn();

const mockOpenAICreate = jest.fn().mockResolvedValue({
  choices: [
    {
      message: {
        content: JSON.stringify({ hasInconsistencies: false, inconsistencies: [] }),
      },
    },
  ],
});

// ─── ESM-compatible module mocks ─────────────────────────────────────────────

jest.unstable_mockModule('../../config/database.js', () => ({
  prisma: {
    claim: { findUnique: mockFindUnique, count: mockCount },
    document: { findFirst: mockDocFindFirst },
    fraudAnalysis: { upsert: mockUpsert },
    auditEvent: { create: mockAuditCreate },
  },
}));

jest.unstable_mockModule('openai', () => ({
  default: jest.fn().mockImplementation(() => ({
    chat: { completions: { create: mockOpenAICreate } },
  })),
}));

// Dynamic imports must come AFTER jest.unstable_mockModule() calls
const { runFraudDetection } = await import('../../services/fraudDetection.service.js');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getUpsertArg() {
  return mockUpsert.mock.calls[0]?.[0] as {
    create: { riskScore: number; riskLevel: string; signals: Array<{ factor: string; weight: number }> };
  };
}

// ─── Claim builder ────────────────────────────────────────────────────────────

function makeClaim(overrides: Record<string, unknown> = {}) {
  return {
    id: 'claim-1',
    policyId: 'policy-1',
    serviceDate: new Date('2024-06-01'),
    serviceType: 'PHYSIOTHERAPY',
    lossAmount: 127, // irregular — not divisible by 50, so no round_number_billing signal
    serviceDescription: null, // avoids OpenAI call in most tests
    provider: null,
    policy: {
      effectiveDate: new Date('2023-01-01'), // well before serviceDate — no early_claim signal
      holderName: 'John Doe',
      reasonableAndCustomary: { PHYSIOTHERAPY: 500 },
    },
    documents: [],
    ...overrides,
  };
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('runFraudDetection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCount.mockResolvedValue(0);
    mockDocFindFirst.mockResolvedValue(null);
    mockUpsert.mockResolvedValue({});
    mockAuditCreate.mockResolvedValue({});
    mockOpenAICreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({ hasInconsistencies: false, inconsistencies: [] }),
          },
        },
      ],
    });
  });

  // ─── Error handling ──────────────────────────────────────────────────────

  it('throws an error when the claim does not exist', async () => {
    mockFindUnique.mockResolvedValue(null);
    await expect(runFraudDetection('nonexistent')).rejects.toThrow('Claim nonexistent not found');
  });

  // ─── Persistence ────────────────────────────────────────────────────────

  it('creates a fraud analysis record and audit event for every processed claim', async () => {
    mockFindUnique.mockResolvedValue(makeClaim());

    await runFraudDetection('claim-1');

    expect(mockUpsert).toHaveBeenCalledTimes(1);
    expect(mockAuditCreate).toHaveBeenCalledTimes(1);
  });

  // ─── Clean claim (no signals) ────────────────────────────────────────────

  it('produces a risk score of 0 with no signals for a clean claim', async () => {
    mockFindUnique.mockResolvedValue(makeClaim());

    await runFraudDetection('claim-1');

    const { create } = getUpsertArg();
    expect(create.riskScore).toBe(0);
    expect(create.signals).toHaveLength(0);
  });

  // ─── early_claim signal ──────────────────────────────────────────────────

  it('adds an early_claim signal when the policy is < 30 days old at service date', async () => {
    const serviceDate = new Date('2024-06-15');
    mockFindUnique.mockResolvedValue(
      makeClaim({
        serviceDate,
        policy: {
          effectiveDate: new Date('2024-06-01'), // 14 days before serviceDate
          holderName: 'John Doe',
          reasonableAndCustomary: { PHYSIOTHERAPY: 500 },
        },
      }),
    );

    await runFraudDetection('claim-1');

    const { create } = getUpsertArg();
    expect(create.signals.some((s) => s.factor === 'early_claim')).toBe(true);
  });

  it('does NOT add early_claim when the policy is exactly 30 days old', async () => {
    const serviceDate = new Date('2024-07-01');
    mockFindUnique.mockResolvedValue(
      makeClaim({
        serviceDate,
        policy: {
          effectiveDate: new Date('2024-06-01'), // exactly 30 days before
          holderName: 'John Doe',
          reasonableAndCustomary: { PHYSIOTHERAPY: 500 },
        },
      }),
    );

    await runFraudDetection('claim-1');

    const { create } = getUpsertArg();
    expect(create.signals.some((s) => s.factor === 'early_claim')).toBe(false);
  });

  // ─── multiple_claims signal ──────────────────────────────────────────────

  it('adds a multiple_claims signal when there are >= 2 prior claims in 24 months', async () => {
    mockFindUnique.mockResolvedValue(makeClaim());
    mockCount.mockResolvedValue(2);

    await runFraudDetection('claim-1');

    const { create } = getUpsertArg();
    expect(create.signals.some((s) => s.factor === 'multiple_claims')).toBe(true);
  });

  it('does NOT add multiple_claims with only 1 prior claim', async () => {
    mockFindUnique.mockResolvedValue(makeClaim());
    mockCount.mockResolvedValue(1);

    await runFraudDetection('claim-1');

    const { create } = getUpsertArg();
    expect(create.signals.some((s) => s.factor === 'multiple_claims')).toBe(false);
  });

  // ─── R&C amount signals ──────────────────────────────────────────────────

  it('adds an excessive_amount signal when the claimed amount is > 2.5× the R&C limit', async () => {
    mockFindUnique.mockResolvedValue(makeClaim({ lossAmount: 1300 })); // 1300/500 = 2.6

    await runFraudDetection('claim-1');

    const { create } = getUpsertArg();
    expect(create.signals.some((s) => s.factor === 'excessive_amount')).toBe(true);
    expect(create.signals.some((s) => s.factor === 'high_amount')).toBe(false);
  });

  it('adds a high_amount signal when the amount is between 1.5× and 2.5× the R&C limit', async () => {
    mockFindUnique.mockResolvedValue(makeClaim({ lossAmount: 900 })); // 900/500 = 1.8

    await runFraudDetection('claim-1');

    const { create } = getUpsertArg();
    expect(create.signals.some((s) => s.factor === 'high_amount')).toBe(true);
    expect(create.signals.some((s) => s.factor === 'excessive_amount')).toBe(false);
  });

  it('adds no amount signal when the amount is at or below the R&C limit', async () => {
    mockFindUnique.mockResolvedValue(makeClaim({ lossAmount: 499 }));

    await runFraudDetection('claim-1');

    const { create } = getUpsertArg();
    expect(create.signals.some((s) => ['excessive_amount', 'high_amount'].includes(s.factor))).toBe(false);
  });

  // ─── round_number_billing signal ─────────────────────────────────────────

  it('adds a round_number_billing signal for amounts divisible by 50 and >= 100', async () => {
    mockFindUnique.mockResolvedValue(makeClaim({ lossAmount: 200 }));

    await runFraudDetection('claim-1');

    const { create } = getUpsertArg();
    expect(create.signals.some((s) => s.factor === 'round_number_billing')).toBe(true);
  });

  it('does NOT add round_number_billing for irregular amounts', async () => {
    mockFindUnique.mockResolvedValue(makeClaim({ lossAmount: 127 }));

    await runFraudDetection('claim-1');

    const { create } = getUpsertArg();
    expect(create.signals.some((s) => s.factor === 'round_number_billing')).toBe(false);
  });

  it('does NOT add round_number_billing for round amounts below 100', async () => {
    mockFindUnique.mockResolvedValue(makeClaim({ lossAmount: 50 }));

    await runFraudDetection('claim-1');

    const { create } = getUpsertArg();
    expect(create.signals.some((s) => s.factor === 'round_number_billing')).toBe(false);
  });

  // ─── name_mismatch signal ────────────────────────────────────────────────

  it('adds a name_mismatch signal when the patient name on documents differs from the policy holder', async () => {
    mockFindUnique.mockResolvedValue(
      makeClaim({
        documents: [{ extractedData: { patientName: 'Jane Smith' }, extractionStatus: 'COMPLETE' }],
      }),
    );

    await runFraudDetection('claim-1');

    const { create } = getUpsertArg();
    expect(create.signals.some((s) => s.factor === 'name_mismatch')).toBe(true);
  });

  it('does NOT add name_mismatch when the patient name matches the policy holder', async () => {
    mockFindUnique.mockResolvedValue(
      makeClaim({
        documents: [{ extractedData: { patientName: 'John Doe' }, extractionStatus: 'COMPLETE' }],
      }),
    );

    await runFraudDetection('claim-1');

    const { create } = getUpsertArg();
    expect(create.signals.some((s) => s.factor === 'name_mismatch')).toBe(false);
  });

  it('does NOT add name_mismatch when a partial last-name match is found', async () => {
    mockFindUnique.mockResolvedValue(
      makeClaim({
        // policy holder is 'John Doe'; document has 'J. Doe' — last name matches
        documents: [{ extractedData: { patientName: 'J. Doe' }, extractionStatus: 'COMPLETE' }],
      }),
    );

    await runFraudDetection('claim-1');

    const { create } = getUpsertArg();
    expect(create.signals.some((s) => s.factor === 'name_mismatch')).toBe(false);
  });

  // ─── date_inconsistency signal ───────────────────────────────────────────

  it('adds a date_inconsistency signal when a document date differs by > 7 days', async () => {
    mockFindUnique.mockResolvedValue(
      makeClaim({
        serviceDate: new Date('2024-06-01'),
        documents: [
          {
            extractedData: { serviceDate: '2024-07-15' }, // 44 days off
            extractionStatus: 'COMPLETE',
          },
        ],
      }),
    );

    await runFraudDetection('claim-1');

    const { create } = getUpsertArg();
    expect(create.signals.some((s) => s.factor === 'date_inconsistency')).toBe(true);
  });

  it('does NOT add date_inconsistency when the document date is within 7 days', async () => {
    mockFindUnique.mockResolvedValue(
      makeClaim({
        serviceDate: new Date('2024-06-01'),
        documents: [
          {
            extractedData: { serviceDate: '2024-06-04' }, // 3 days off — within tolerance
            extractionStatus: 'COMPLETE',
          },
        ],
      }),
    );

    await runFraudDetection('claim-1');

    const { create } = getUpsertArg();
    expect(create.signals.some((s) => s.factor === 'date_inconsistency')).toBe(false);
  });

  // ─── document_tampering signal ───────────────────────────────────────────

  it('adds a document_tampering signal when documentQuality is SUSPICIOUS', async () => {
    mockFindUnique.mockResolvedValue(
      makeClaim({
        documents: [
          {
            extractedData: {
              documentQuality: 'SUSPICIOUS',
              tamperingIndicators: ['altered font', 'inconsistent spacing'],
            },
            extractionStatus: 'COMPLETE',
          },
        ],
      }),
    );

    await runFraudDetection('claim-1');

    const { create } = getUpsertArg();
    expect(create.signals.some((s) => s.factor === 'document_tampering')).toBe(true);
  });

  it('adds a document_tampering signal when tamperingIndicators array is non-empty', async () => {
    mockFindUnique.mockResolvedValue(
      makeClaim({
        documents: [
          {
            extractedData: { tamperingIndicators: ['missing watermark'] },
            extractionStatus: 'COMPLETE',
          },
        ],
      }),
    );

    await runFraudDetection('claim-1');

    const { create } = getUpsertArg();
    expect(create.signals.some((s) => s.factor === 'document_tampering')).toBe(true);
  });

  // ─── Risk score cap ──────────────────────────────────────────────────────

  it('caps the total risk score at 1.0 even when signal weights exceed 1.0', async () => {
    const serviceDate = new Date('2024-06-15');
    mockFindUnique.mockResolvedValue(
      makeClaim({
        serviceDate,
        lossAmount: 1300, // excessive_amount (weight 0.25)
        policy: {
          effectiveDate: new Date('2024-06-01'), // early_claim (weight 0.3)
          holderName: 'John Doe',
          reasonableAndCustomary: { PHYSIOTHERAPY: 500 },
        },
        documents: [
          {
            extractedData: {
              patientName: 'Jane Smith', // name_mismatch (weight 0.3)
              documentQuality: 'SUSPICIOUS', // document_tampering (weight 0.35)
              tamperingIndicators: ['font inconsistency'],
            },
            extractionStatus: 'COMPLETE',
          },
        ],
      }),
    );
    mockCount.mockResolvedValue(3); // multiple_claims (weight 0.2)

    await runFraudDetection('claim-1');

    const { create } = getUpsertArg();
    expect(create.riskScore).toBeLessThanOrEqual(1.0);
    expect(create.riskScore).toBeGreaterThan(0);
  });
});
