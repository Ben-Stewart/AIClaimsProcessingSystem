import { z } from 'zod';
import { ClaimStatus, DocumentType, IncidentType, UserRole } from '../types/index.js';

// ─────────────────────────────────────────────
// Auth
// ─────────────────────────────────────────────

export const LoginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export type LoginInput = z.infer<typeof LoginSchema>;

export const RegisterSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(2, 'Name must be at least 2 characters'),
  policyNumber: z.string().min(1, 'Policy number is required'),
});

export type RegisterInput = z.infer<typeof RegisterSchema>;

// ─────────────────────────────────────────────
// Claims
// ─────────────────────────────────────────────

export const CreateClaimSchema = z.object({
  policyNumber: z.string().min(1, 'Policy number is required'),
  incidentDate: z.string().datetime({ message: 'Invalid incident date' }),
  incidentType: z.nativeEnum(IncidentType),
  incidentDescription: z
    .string()
    .min(20, 'Please provide at least 20 characters describing the incident')
    .max(5000),
  lossAmount: z.number().positive().optional(),
});

export type CreateClaimInput = z.infer<typeof CreateClaimSchema>;

export const UpdateClaimSchema = z.object({
  status: z.nativeEnum(ClaimStatus).optional(),
  adjusterNotes: z.string().max(10000).optional(),
  lossAmount: z.number().positive().optional(),
  adjusterId: z.string().optional(),
});

export type UpdateClaimInput = z.infer<typeof UpdateClaimSchema>;

export const ApproveClaimSchema = z.object({
  amount: z.number().positive('Settlement amount must be positive'),
  notes: z.string().max(2000).optional(),
});

export type ApproveClaimInput = z.infer<typeof ApproveClaimSchema>;

export const DenyClaimSchema = z.object({
  reason: z.string().min(10, 'Please provide a denial reason').max(2000),
  notes: z.string().max(2000).optional(),
});

export type DenyClaimInput = z.infer<typeof DenyClaimSchema>;

export const RequestInfoSchema = z.object({
  message: z.string().min(10).max(2000),
  requiredDocuments: z.array(z.nativeEnum(DocumentType)).optional(),
});

export type RequestInfoInput = z.infer<typeof RequestInfoSchema>;

export const ClaimsQuerySchema = z.object({
  status: z.nativeEnum(ClaimStatus).optional(),
  incidentType: z.nativeEnum(IncidentType).optional(),
  adjusterId: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
});

export type ClaimsQueryInput = z.infer<typeof ClaimsQuerySchema>;

// ─────────────────────────────────────────────
// Documents
// ─────────────────────────────────────────────

export const DocumentUploadSchema = z.object({
  type: z.nativeEnum(DocumentType),
});

export type DocumentUploadInput = z.infer<typeof DocumentUploadSchema>;

// ─────────────────────────────────────────────
// Users
// ─────────────────────────────────────────────

export const CreateUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(100),
  password: z.string().min(8),
  role: z.nativeEnum(UserRole).default(UserRole.ADJUSTER),
});

export type CreateUserInput = z.infer<typeof CreateUserSchema>;
