import { ClaimStatus, RiskLevel } from '../types/index.js';

// Claim status display labels
export const CLAIM_STATUS_LABELS: Record<ClaimStatus, string> = {
  [ClaimStatus.FNOL_RECEIVED]: 'FNOL Received',
  [ClaimStatus.DOCUMENTS_PENDING]: 'Documents Pending',
  [ClaimStatus.DOCUMENTS_UNDER_REVIEW]: 'Under Review',
  [ClaimStatus.AI_PROCESSING]: 'AI Processing',
  [ClaimStatus.COVERAGE_VERIFIED]: 'Coverage Verified',
  [ClaimStatus.ASSESSMENT_COMPLETE]: 'Assessment Complete',
  [ClaimStatus.FRAUD_REVIEW]: 'Fraud Review',
  [ClaimStatus.PENDING_ADJUSTER_DECISION]: 'Awaiting Decision',
  [ClaimStatus.PENDING_ADDITIONAL_INFO]: 'Info Requested',
  [ClaimStatus.APPROVED]: 'Approved',
  [ClaimStatus.DENIED]: 'Denied',
  [ClaimStatus.SETTLED]: 'Settled',
  [ClaimStatus.CLOSED]: 'Closed',
};

// Statuses where the claim is actively open/in-flight
export const OPEN_CLAIM_STATUSES: ClaimStatus[] = [
  ClaimStatus.FNOL_RECEIVED,
  ClaimStatus.DOCUMENTS_PENDING,
  ClaimStatus.DOCUMENTS_UNDER_REVIEW,
  ClaimStatus.AI_PROCESSING,
  ClaimStatus.COVERAGE_VERIFIED,
  ClaimStatus.ASSESSMENT_COMPLETE,
  ClaimStatus.FRAUD_REVIEW,
  ClaimStatus.PENDING_ADJUSTER_DECISION,
  ClaimStatus.PENDING_ADDITIONAL_INFO,
];

// Risk level thresholds (fraud score 0–1)
export const RISK_THRESHOLDS = {
  [RiskLevel.LOW]: { min: 0, max: 0.3 },
  [RiskLevel.MEDIUM]: { min: 0.3, max: 0.6 },
  [RiskLevel.HIGH]: { min: 0.6, max: 0.8 },
  [RiskLevel.CRITICAL]: { min: 0.8, max: 1.0 },
} as const;

// AI confidence display thresholds
export const CONFIDENCE_THRESHOLDS = {
  HIGH: 0.85,
  MEDIUM: 0.60,
} as const;

// WebSocket event names
export const WS_EVENTS = {
  // Client → Server
  SUBSCRIBE_CLAIM: 'subscribe:claim',
  UNSUBSCRIBE_CLAIM: 'unsubscribe:claim',

  // Server → Client
  AI_JOB_STARTED: 'ai:job:started',
  AI_JOB_PROGRESS: 'ai:job:progress',
  AI_JOB_COMPLETED: 'ai:job:completed',
  AI_JOB_FAILED: 'ai:job:failed',
  CLAIM_UPDATED: 'claim:updated',
  CLAIM_READY_FOR_REVIEW: 'claim:ready_for_review',
} as const;

// BullMQ queue names
export const QUEUE_NAMES = {
  DOCUMENT_ANALYSIS: 'document-analysis',
  FRAUD_DETECTION: 'fraud-detection',
  COVERAGE_VERIFICATION: 'coverage-verification',
  DAMAGE_ASSESSMENT: 'damage-assessment',
  SETTLEMENT_CALCULATION: 'settlement-calculation',
  CLAIM_PIPELINE: 'claim-pipeline',
} as const;

// BullMQ job priorities
export const JOB_PRIORITIES = {
  CRITICAL: 1,
  HIGH: 2,
  NORMAL: 5,
  LOW: 10,
} as const;

// Supported file types for document upload
export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
] as const;

export const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20MB
