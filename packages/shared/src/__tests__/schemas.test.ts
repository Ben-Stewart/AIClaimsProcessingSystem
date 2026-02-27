import { describe, it, expect } from '@jest/globals';
import {
  LoginSchema,
  RegisterSchema,
  CreateClaimSchema,
  ApproveClaimSchema,
  DenyClaimSchema,
  ClaimsQuerySchema,
  CreateUserSchema,
} from '../schemas/index.js';
import { ServiceType, UserRole } from '../types/index.js';

describe('LoginSchema', () => {
  it('accepts valid credentials', () => {
    const result = LoginSchema.safeParse({ email: 'user@example.com', password: 'password123' });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid email address', () => {
    const result = LoginSchema.safeParse({ email: 'not-an-email', password: 'password123' });
    expect(result.success).toBe(false);
    expect(result.error?.flatten().fieldErrors.email).toBeDefined();
  });

  it('rejects a password shorter than 6 characters', () => {
    const result = LoginSchema.safeParse({ email: 'user@example.com', password: 'abc' });
    expect(result.success).toBe(false);
    expect(result.error?.flatten().fieldErrors.password).toBeDefined();
  });

  it('rejects missing fields', () => {
    expect(LoginSchema.safeParse({}).success).toBe(false);
    expect(LoginSchema.safeParse({ email: 'user@example.com' }).success).toBe(false);
  });
});

describe('RegisterSchema', () => {
  const valid = {
    email: 'user@example.com',
    password: 'securepassword',
    name: 'John Doe',
    policyNumber: 'POL-001',
  };

  it('accepts valid registration data', () => {
    expect(RegisterSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects a password shorter than 8 characters', () => {
    const result = RegisterSchema.safeParse({ ...valid, password: 'short' });
    expect(result.success).toBe(false);
    expect(result.error?.flatten().fieldErrors.password).toBeDefined();
  });

  it('rejects a name shorter than 2 characters', () => {
    const result = RegisterSchema.safeParse({ ...valid, name: 'J' });
    expect(result.success).toBe(false);
    expect(result.error?.flatten().fieldErrors.name).toBeDefined();
  });

  it('rejects an empty policy number', () => {
    const result = RegisterSchema.safeParse({ ...valid, policyNumber: '' });
    expect(result.success).toBe(false);
    expect(result.error?.flatten().fieldErrors.policyNumber).toBeDefined();
  });
});

describe('CreateClaimSchema', () => {
  const valid = {
    policyNumber: 'POL-001',
    serviceDate: '2024-01-15',
    serviceType: ServiceType.PHYSIOTHERAPY,
    lossAmount: 1500,
  };

  it('accepts valid claim data', () => {
    expect(CreateClaimSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects a non-date service date string', () => {
    const result = CreateClaimSchema.safeParse({ ...valid, serviceDate: 'not-a-date' });
    expect(result.success).toBe(false);
    expect(result.error?.flatten().fieldErrors.serviceDate).toBeDefined();
  });

  it('rejects a zero loss amount', () => {
    const result = CreateClaimSchema.safeParse({ ...valid, lossAmount: 0 });
    expect(result.success).toBe(false);
    expect(result.error?.flatten().fieldErrors.lossAmount).toBeDefined();
  });

  it('rejects a negative loss amount', () => {
    expect(CreateClaimSchema.safeParse({ ...valid, lossAmount: -100 }).success).toBe(false);
  });

  it('rejects an invalid service type', () => {
    expect(CreateClaimSchema.safeParse({ ...valid, serviceType: 'INVALID_TYPE' }).success).toBe(false);
  });

  it('accepts all valid ServiceType enum values', () => {
    for (const type of Object.values(ServiceType)) {
      expect(CreateClaimSchema.safeParse({ ...valid, serviceType: type }).success).toBe(true);
    }
  });

  it('accepts an optional provider object', () => {
    const result = CreateClaimSchema.safeParse({
      ...valid,
      provider: { name: 'City Hospital', address: '123 Main St', phone: '555-1234' },
    });
    expect(result.success).toBe(true);
  });

  it('accepts an optional service description', () => {
    expect(
      CreateClaimSchema.safeParse({ ...valid, serviceDescription: 'Emergency visit' }).success,
    ).toBe(true);
  });
});

describe('ApproveClaimSchema', () => {
  it('accepts a valid reimbursement amount', () => {
    expect(ApproveClaimSchema.safeParse({ amount: 1000 }).success).toBe(true);
  });

  it('accepts an optional notes field', () => {
    expect(ApproveClaimSchema.safeParse({ amount: 1000, notes: 'Approved after review' }).success).toBe(true);
  });

  it('rejects a zero amount', () => {
    expect(ApproveClaimSchema.safeParse({ amount: 0 }).success).toBe(false);
  });

  it('rejects a negative amount', () => {
    expect(ApproveClaimSchema.safeParse({ amount: -500 }).success).toBe(false);
  });
});

describe('DenyClaimSchema', () => {
  it('accepts a valid denial reason', () => {
    expect(
      DenyClaimSchema.safeParse({ reason: 'Coverage does not apply to this service type' }).success,
    ).toBe(true);
  });

  it('rejects a reason shorter than 10 characters', () => {
    const result = DenyClaimSchema.safeParse({ reason: 'Too short' });
    expect(result.success).toBe(false);
    expect(result.error?.flatten().fieldErrors.reason).toBeDefined();
  });

  it('accepts optional notes alongside the reason', () => {
    expect(
      DenyClaimSchema.safeParse({
        reason: 'Coverage does not apply to this procedure',
        notes: 'Reviewed policy section 4.2',
      }).success,
    ).toBe(true);
  });
});

describe('ClaimsQuerySchema', () => {
  it('applies default values for page and limit when absent', () => {
    const result = ClaimsQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    expect(result.data?.page).toBe(1);
    expect(result.data?.limit).toBe(20);
  });

  it('coerces page and limit from string values', () => {
    const result = ClaimsQuerySchema.safeParse({ page: '3', limit: '50' });
    expect(result.success).toBe(true);
    expect(result.data?.page).toBe(3);
    expect(result.data?.limit).toBe(50);
  });

  it('rejects a limit above 100', () => {
    expect(ClaimsQuerySchema.safeParse({ limit: '101' }).success).toBe(false);
  });

  it('rejects a page below 1', () => {
    expect(ClaimsQuerySchema.safeParse({ page: '0' }).success).toBe(false);
  });

  it('rejects a non-integer page', () => {
    expect(ClaimsQuerySchema.safeParse({ page: '1.5' }).success).toBe(false);
  });
});

describe('CreateUserSchema', () => {
  const valid = {
    email: 'admin@example.com',
    name: 'Admin User',
    password: 'strongpassword',
  };

  it('accepts valid user data with default role', () => {
    const result = CreateUserSchema.safeParse(valid);
    expect(result.success).toBe(true);
    expect(result.data?.role).toBe(UserRole.ADJUSTER);
  });

  it('accepts an explicit role override', () => {
    const result = CreateUserSchema.safeParse({ ...valid, role: UserRole.ADMIN });
    expect(result.success).toBe(true);
    expect(result.data?.role).toBe(UserRole.ADMIN);
  });

  it('rejects an invalid role value', () => {
    expect(CreateUserSchema.safeParse({ ...valid, role: 'SUPERUSER' }).success).toBe(false);
  });
});
