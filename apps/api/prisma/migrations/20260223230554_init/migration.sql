-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADJUSTER', 'SUPERVISOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('FNOL_RECEIVED', 'DOCUMENTS_PENDING', 'DOCUMENTS_UNDER_REVIEW', 'AI_PROCESSING', 'COVERAGE_VERIFIED', 'ASSESSMENT_COMPLETE', 'FRAUD_REVIEW', 'PENDING_ADJUSTER_DECISION', 'PENDING_ADDITIONAL_INFO', 'APPROVED', 'DENIED', 'SETTLED', 'CLOSED');

-- CreateEnum
CREATE TYPE "IncidentType" AS ENUM ('AUTO_COLLISION', 'AUTO_THEFT', 'PROPERTY_DAMAGE', 'PERSONAL_INJURY', 'MEDICAL', 'NATURAL_DISASTER', 'LIABILITY');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('MEDICAL_RECORD', 'POLICE_REPORT', 'DAMAGE_PHOTO', 'REPAIR_ESTIMATE', 'INVOICE', 'DRIVERS_LICENSE', 'INSURANCE_CARD', 'WITNESS_STATEMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "ExtractionStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETE', 'FAILED');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "DamageSeverity" AS ENUM ('MINOR', 'MODERATE', 'SEVERE', 'TOTAL_LOSS');

-- CreateEnum
CREATE TYPE "FraudRecommendation" AS ENUM ('APPROVE', 'FLAG_FOR_REVIEW', 'ESCALATE_SIU');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'ADJUSTER',
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policies" (
    "id" TEXT NOT NULL,
    "policyNumber" TEXT NOT NULL,
    "holderName" TEXT NOT NULL,
    "holderEmail" TEXT NOT NULL,
    "coverageType" TEXT NOT NULL,
    "coverageLimit" DECIMAL(12,2) NOT NULL,
    "deductible" DECIMAL(12,2) NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "expiryDate" TIMESTAMP(3) NOT NULL,
    "rawData" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "claims" (
    "id" TEXT NOT NULL,
    "claimNumber" TEXT NOT NULL,
    "status" "ClaimStatus" NOT NULL DEFAULT 'FNOL_RECEIVED',
    "incidentDate" TIMESTAMP(3) NOT NULL,
    "incidentType" "IncidentType" NOT NULL,
    "incidentDescription" TEXT NOT NULL,
    "lossAmount" DECIMAL(12,2),
    "adjusterNotes" TEXT,
    "policyId" TEXT NOT NULL,
    "adjusterId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "type" "DocumentType" NOT NULL,
    "originalName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "extractionStatus" "ExtractionStatus" NOT NULL DEFAULT 'PENDING',
    "extractedData" JSONB,
    "extractionConfidence" DOUBLE PRECISION,
    "extractionError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_assessments" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "damageSeverity" "DamageSeverity" NOT NULL,
    "estimatedRepairCost" DECIMAL(12,2),
    "damageCategories" JSONB NOT NULL DEFAULT '[]',
    "comparableClaims" JSONB NOT NULL DEFAULT '[]',
    "coverageApplicable" BOOLEAN NOT NULL,
    "coverageReason" TEXT NOT NULL,
    "applicableEndorsements" JSONB NOT NULL DEFAULT '[]',
    "overallConfidence" DOUBLE PRECISION NOT NULL,
    "processingTimeMs" INTEGER NOT NULL,
    "modelVersions" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fraud_analyses" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "riskScore" DOUBLE PRECISION NOT NULL,
    "riskLevel" "RiskLevel" NOT NULL,
    "signals" JSONB NOT NULL DEFAULT '[]',
    "anomalies" JSONB NOT NULL DEFAULT '[]',
    "networkLinks" JSONB,
    "recommendation" "FraudRecommendation" NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "reviewedById" TEXT,
    "reviewOutcome" TEXT,
    "reviewNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fraud_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settlement_recommendations" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "recommendedAmount" DECIMAL(12,2) NOT NULL,
    "rangeLow" DECIMAL(12,2) NOT NULL,
    "rangeHigh" DECIMAL(12,2) NOT NULL,
    "methodology" TEXT NOT NULL,
    "comparableCount" INTEGER NOT NULL,
    "marketDataSource" TEXT NOT NULL DEFAULT 'internal',
    "confidence" DOUBLE PRECISION NOT NULL,
    "adjusterDecision" DECIMAL(12,2),
    "adjusterRationale" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settlement_recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "reference" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "actorId" TEXT,
    "actorType" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "details" JSONB NOT NULL DEFAULT '{}',
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "policies_policyNumber_key" ON "policies"("policyNumber");

-- CreateIndex
CREATE UNIQUE INDEX "claims_claimNumber_key" ON "claims"("claimNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ai_assessments_claimId_key" ON "ai_assessments"("claimId");

-- CreateIndex
CREATE UNIQUE INDEX "fraud_analyses_claimId_key" ON "fraud_analyses"("claimId");

-- CreateIndex
CREATE UNIQUE INDEX "settlement_recommendations_claimId_key" ON "settlement_recommendations"("claimId");

-- CreateIndex
CREATE INDEX "audit_events_claimId_idx" ON "audit_events"("claimId");

-- CreateIndex
CREATE INDEX "audit_events_timestamp_idx" ON "audit_events"("timestamp");

-- AddForeignKey
ALTER TABLE "claims" ADD CONSTRAINT "claims_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "policies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claims" ADD CONSTRAINT "claims_adjusterId_fkey" FOREIGN KEY ("adjusterId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "claims"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_assessments" ADD CONSTRAINT "ai_assessments_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "claims"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fraud_analyses" ADD CONSTRAINT "fraud_analyses_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "claims"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlement_recommendations" ADD CONSTRAINT "settlement_recommendations_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "claims"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "claims"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "claims"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
