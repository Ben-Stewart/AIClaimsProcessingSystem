-- Rename DamageSeverity enum to ClaimSeverity
ALTER TYPE "DamageSeverity" RENAME TO "ClaimSeverity";

-- Rename SETTLED status value to PAID
ALTER TYPE "ClaimStatus" RENAME VALUE 'SETTLED' TO 'PAID';

-- Rename columns in ai_assessments table
ALTER TABLE "ai_assessments" RENAME COLUMN "damageSeverity" TO "claimSeverity";
ALTER TABLE "ai_assessments" RENAME COLUMN "damageCategories" TO "treatmentCategories";

-- Rename settlement_recommendations table to reimbursement_recommendations
ALTER TABLE "settlement_recommendations" RENAME TO "reimbursement_recommendations";
