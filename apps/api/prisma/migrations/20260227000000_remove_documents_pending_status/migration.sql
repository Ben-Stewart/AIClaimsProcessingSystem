-- Remove DOCUMENTS_PENDING from ClaimStatus enum
-- Safe: no rows use this status (it was never set by any application code)
ALTER TYPE "ClaimStatus" RENAME TO "ClaimStatus_old";

CREATE TYPE "ClaimStatus" AS ENUM (
  'FNOL_RECEIVED',
  'DOCUMENTS_UNDER_REVIEW',
  'AI_PROCESSING',
  'COVERAGE_VERIFIED',
  'ASSESSMENT_COMPLETE',
  'FRAUD_REVIEW',
  'PENDING_ADJUSTER_DECISION',
  'PENDING_ADDITIONAL_INFO',
  'APPROVED',
  'DENIED',
  'PAID',
  'CLOSED'
);

ALTER TABLE "Claim" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Claim" ALTER COLUMN "status" TYPE "ClaimStatus" USING "status"::text::"ClaimStatus";
ALTER TABLE "Claim" ALTER COLUMN "status" SET DEFAULT 'FNOL_RECEIVED';

DROP TYPE "ClaimStatus_old";
