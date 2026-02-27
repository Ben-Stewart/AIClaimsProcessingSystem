import { describe, it, expect } from '@jest/globals';
import { generateClaimNumber } from '../../utils/claimNumber.js';

describe('generateClaimNumber', () => {
  it('returns a string matching the CLM-YYYYMMDD-NNNNN format', () => {
    const claimNumber = generateClaimNumber();
    expect(claimNumber).toMatch(/^CLM-\d{8}-\d{5}$/);
  });

  it("includes today's date in the YYYYMMDD segment", () => {
    const claimNumber = generateClaimNumber();
    const now = new Date();
    const year = String(now.getFullYear());
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    expect(claimNumber).toContain(`CLM-${year}${month}${day}-`);
  });

  it('pads the random segment to exactly 5 digits', () => {
    for (let i = 0; i < 50; i++) {
      const parts = generateClaimNumber().split('-');
      expect(parts[2]).toHaveLength(5);
    }
  });

  it('generates distinct values across multiple calls', () => {
    const numbers = new Set(Array.from({ length: 100 }, () => generateClaimNumber()));
    // With 100,000 possible random values, 100 calls should produce near-unique results
    expect(numbers.size).toBeGreaterThan(90);
  });
});
