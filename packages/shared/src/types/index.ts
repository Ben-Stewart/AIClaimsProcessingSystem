// ─────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────

export enum ClaimStatus {
  FNOL_RECEIVED = 'FNOL_RECEIVED',
  DOCUMENTS_UNDER_REVIEW = 'DOCUMENTS_UNDER_REVIEW',
  AI_PROCESSING = 'AI_PROCESSING',
  COVERAGE_VERIFIED = 'COVERAGE_VERIFIED',
  ASSESSMENT_COMPLETE = 'ASSESSMENT_COMPLETE',
  FRAUD_REVIEW = 'FRAUD_REVIEW',
  PENDING_ADJUSTER_DECISION = 'PENDING_ADJUSTER_DECISION',
  PENDING_ADDITIONAL_INFO = 'PENDING_ADDITIONAL_INFO',
  APPROVED = 'APPROVED',
  DENIED = 'DENIED',
  PAID = 'PAID',
  CLOSED = 'CLOSED',
}

export enum ServiceType {
  PHYSIOTHERAPY = 'PHYSIOTHERAPY',
  MASSAGE_THERAPY = 'MASSAGE_THERAPY',
  CHIROPRACTIC = 'CHIROPRACTIC',
  PSYCHOLOGIST = 'PSYCHOLOGIST',
  DENTAL_PREVENTIVE = 'DENTAL_PREVENTIVE',
  DENTAL_RESTORATIVE = 'DENTAL_RESTORATIVE',
  VISION_CARE = 'VISION_CARE',
}

export enum DocumentType {
  MEDICAL_RECORD = 'MEDICAL_RECORD',
  REFERRAL_LETTER = 'REFERRAL_LETTER',
  DENTAL_XRAY = 'DENTAL_XRAY',
  TREATMENT_PLAN = 'TREATMENT_PLAN',
  INVOICE = 'INVOICE',
  EXPLANATION_OF_BENEFITS = 'EXPLANATION_OF_BENEFITS',
  INSURANCE_CARD = 'INSURANCE_CARD',
  WITNESS_STATEMENT = 'WITNESS_STATEMENT',
  RECEIPT = 'RECEIPT',
  OTHER = 'OTHER',
}

export enum ExtractionStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETE = 'COMPLETE',
  FAILED = 'FAILED',
}

export enum RiskLevel {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export enum UserRole {
  CLIENT = 'CLIENT',
  ADJUSTER = 'ADJUSTER',
  SUPERVISOR = 'SUPERVISOR',
  ADMIN = 'ADMIN',
}

export enum PaymentStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export enum ClaimComplexity {
  SIMPLE = 'SIMPLE',
  MODERATE = 'MODERATE',
  COMPLEX = 'COMPLEX',
}

export enum ClaimSeverity {
  MINOR = 'MINOR',
  MODERATE = 'MODERATE',
  SEVERE = 'SEVERE',
  CATASTROPHIC = 'CATASTROPHIC',
}

export enum FraudRecommendation {
  APPROVE = 'APPROVE',
  FLAG_FOR_REVIEW = 'FLAG_FOR_REVIEW',
  ESCALATE_SIU = 'ESCALATE_SIU',
}

// ─────────────────────────────────────────────
// Domain types
// ─────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: string;
  policy?: {
    policyNumber: string;
    coverageType: string;
    coverageLimit: number;
    deductible: number;
    percentCovered: number;
    reasonableAndCustomary: Record<string, number>;
    effectiveDate: string;
    expiryDate: string;
  } | null;
}

export interface Policy {
  id: string;
  policyNumber: string;
  holderName: string;
  holderEmail: string;
  coverageType: string;
  coverageLimit: number;
  deductible: number;
  percentCovered: number;
  reasonableAndCustomary: Record<string, number>;
  effectiveDate: string;
  expiryDate: string;
}

export interface Claim {
  id: string;
  claimNumber: string;
  status: ClaimStatus;
  serviceDate: string;
  serviceType: ServiceType;
  serviceDescription: string;
  lossAmount: number | null;
  provider: { name: string; address?: string; phone?: string } | null;
  adjusterNotes: string | null;
  policyId: string;
  policy?: Policy;
  adjusterId: string | null;
  adjuster?: User;
  documents?: Document[];
  aiAssessment?: AIAssessment;
  fraudAnalysis?: FraudAnalysis;
  reimbursementRecommendation?: ReimbursementRecommendation;
  createdAt: string;
  updatedAt: string;
}

export interface Document {
  id: string;
  claimId: string;
  type: DocumentType;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  extractionStatus: ExtractionStatus;
  extractedData: Record<string, unknown> | null;
  extractionConfidence: number | null;
  createdAt: string;
}

export interface AIAssessment {
  id: string;
  claimId: string;
  claimSeverity: ClaimSeverity;
  estimatedTreatmentCost: number | null;
  treatmentCategories: TreatmentCategory[];
  comparableClaims: ComparableClaim[];
  coverageApplicable: boolean;
  coverageReason: string;
  overallConfidence: number;
  severityRationale: string | null;
  confidenceRationale: string | null;
  processingTimeMs: number;
  createdAt: string;
}

export interface TreatmentCategory {
  category: string;
  description: string;
  confidence: number;
}

export interface ComparableClaim {
  claimId: string;
  serviceType: ServiceType;
  reimbursementAmount: number;
  similarity: number;
}

export interface FraudSignal {
  factor: string;
  weight: number;
  description: string;
}

export interface FraudAnalysis {
  id: string;
  claimId: string;
  riskScore: number;
  riskLevel: RiskLevel;
  signals: FraudSignal[];
  anomalies: string[];
  recommendation: FraudRecommendation;
  confidence: number;
  createdAt: string;
}

export interface ReimbursementRecommendation {
  id: string;
  claimId: string;
  recommendedAmount: number;
  rangeLow: number;
  rangeHigh: number;
  methodology: string;
  comparableCount: number;
  confidence: number;
  adjusterDecision: number | null;
  adjusterRationale: string | null;
  createdAt: string;
}

export interface AuditEvent {
  id: string;
  claimId: string;
  actorId: string | null;
  actorType: 'HUMAN' | 'AI_SYSTEM';
  action: string;
  details: Record<string, unknown>;
  timestamp: string;
}

export interface Payment {
  id: string;
  claimId: string;
  amount: number;
  paymentMethod: string;
  status: PaymentStatus;
  reference: string | null;
  processedAt: string | null;
  createdAt: string;
}

// ─────────────────────────────────────────────
// API response wrappers
// ─────────────────────────────────────────────

export interface ApiResponse<T> {
  data: T;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ApiError {
  error: string;
  message: string;
  statusCode: number;
}

// ─────────────────────────────────────────────
// WebSocket event payloads
// ─────────────────────────────────────────────

export interface AIJobStartedEvent {
  jobId: string;
  claimId: string;
  type: string;
}

export interface AIJobProgressEvent {
  jobId: string;
  claimId: string;
  progress: number;
  stage: string;
}

export interface AIJobCompletedEvent {
  jobId: string;
  claimId: string;
  type: string;
  resultSummary: string;
}

export interface AIJobFailedEvent {
  jobId: string;
  claimId: string;
  error: string;
}

export interface ClaimUpdatedEvent {
  claimId: string;
  changes: Partial<Claim>;
}

// ─────────────────────────────────────────────
// Analytics
// ─────────────────────────────────────────────

export interface DashboardMetrics {
  totalClaims: number;
  openClaims: number;
  avgProcessingDays: number;
  straightThroughRate: number;
  fraudFlagsToday: number;
  pendingAdjusterDecision: number;
  paidThisMonth: number;
  totalPaidAmount: number;
  trends: {
    totalClaims: number | null;
    openClaims: number | null;
    fraudFlagsToday: number | null;
    pendingAdjusterDecision: number | null;
    paidThisMonth: number | null;
  };
}
