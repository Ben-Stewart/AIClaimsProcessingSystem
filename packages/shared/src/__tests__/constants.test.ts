import { describe, it, expect } from '@jest/globals';
import {
  RISK_THRESHOLDS,
  CLAIM_STATUS_LABELS,
  JOB_PRIORITIES,
  OPEN_CLAIM_STATUSES,
  MAX_FILE_SIZE_BYTES,
  ALLOWED_MIME_TYPES,
} from '../constants/index.js';
import { RiskLevel, ClaimStatus } from '../types/index.js';

describe('RISK_THRESHOLDS', () => {
  it('defines thresholds for all RiskLevel enum values', () => {
    for (const level of Object.values(RiskLevel)) {
      expect(RISK_THRESHOLDS[level]).toBeDefined();
    }
  });

  it('has LOW starting at 0', () => {
    expect(RISK_THRESHOLDS[RiskLevel.LOW].min).toBe(0);
  });

  it('has CRITICAL ending at 1.0', () => {
    expect(RISK_THRESHOLDS[RiskLevel.CRITICAL].max).toBe(1.0);
  });

  it('has no gaps between consecutive risk level thresholds', () => {
    expect(RISK_THRESHOLDS[RiskLevel.MEDIUM].min).toBe(RISK_THRESHOLDS[RiskLevel.LOW].max);
    expect(RISK_THRESHOLDS[RiskLevel.HIGH].min).toBe(RISK_THRESHOLDS[RiskLevel.MEDIUM].max);
    expect(RISK_THRESHOLDS[RiskLevel.CRITICAL].min).toBe(RISK_THRESHOLDS[RiskLevel.HIGH].max);
  });

  it('has all thresholds within the 0–1 range', () => {
    for (const level of Object.values(RiskLevel)) {
      expect(RISK_THRESHOLDS[level].min).toBeGreaterThanOrEqual(0);
      expect(RISK_THRESHOLDS[level].max).toBeLessThanOrEqual(1.0);
      expect(RISK_THRESHOLDS[level].min).toBeLessThan(RISK_THRESHOLDS[level].max);
    }
  });
});

describe('CLAIM_STATUS_LABELS', () => {
  it('has a non-empty label for every ClaimStatus enum value', () => {
    for (const status of Object.values(ClaimStatus)) {
      expect(CLAIM_STATUS_LABELS[status]).toBeDefined();
      expect(CLAIM_STATUS_LABELS[status].length).toBeGreaterThan(0);
    }
  });
});

describe('JOB_PRIORITIES', () => {
  it('orders priorities so CRITICAL < HIGH < NORMAL < LOW (lower number = higher priority)', () => {
    expect(JOB_PRIORITIES.CRITICAL).toBeLessThan(JOB_PRIORITIES.HIGH);
    expect(JOB_PRIORITIES.HIGH).toBeLessThan(JOB_PRIORITIES.NORMAL);
    expect(JOB_PRIORITIES.NORMAL).toBeLessThan(JOB_PRIORITIES.LOW);
  });

  it('uses positive integer values', () => {
    for (const priority of Object.values(JOB_PRIORITIES)) {
      expect(Number.isInteger(priority)).toBe(true);
      expect(priority).toBeGreaterThan(0);
    }
  });
});

describe('OPEN_CLAIM_STATUSES', () => {
  it('does not include terminal statuses', () => {
    const terminal = [ClaimStatus.APPROVED, ClaimStatus.DENIED, ClaimStatus.PAID, ClaimStatus.CLOSED];
    for (const status of terminal) {
      expect(OPEN_CLAIM_STATUSES).not.toContain(status);
    }
  });

  it('includes all in-progress statuses', () => {
    expect(OPEN_CLAIM_STATUSES).toContain(ClaimStatus.FNOL_RECEIVED);
    expect(OPEN_CLAIM_STATUSES).toContain(ClaimStatus.AI_PROCESSING);
    expect(OPEN_CLAIM_STATUSES).toContain(ClaimStatus.PENDING_ADJUSTER_DECISION);
  });
});

describe('MAX_FILE_SIZE_BYTES', () => {
  it('equals 20 MB', () => {
    expect(MAX_FILE_SIZE_BYTES).toBe(20 * 1024 * 1024);
  });
});

describe('ALLOWED_MIME_TYPES', () => {
  it('includes PDF and common image formats', () => {
    expect(ALLOWED_MIME_TYPES).toContain('application/pdf');
    expect(ALLOWED_MIME_TYPES).toContain('image/jpeg');
    expect(ALLOWED_MIME_TYPES).toContain('image/png');
  });
});
