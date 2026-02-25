/*
  Warnings:

  - The values [TOTAL_LOSS] on the enum `DamageSeverity` will be removed. If these variants are still used in the database, this will fail.
  - The values [POLICE_REPORT,DAMAGE_PHOTO,REPAIR_ESTIMATE,DRIVERS_LICENSE] on the enum `DocumentType` will be removed. If these variants are still used in the database, this will fail.
  - The values [AUTO_COLLISION,AUTO_THEFT,PROPERTY_DAMAGE,PERSONAL_INJURY,MEDICAL,NATURAL_DISASTER,LIABILITY] on the enum `IncidentType` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `estimatedRepairCost` on the `ai_assessments` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[clientId]` on the table `policies` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "DamageSeverity_new" AS ENUM ('MINOR', 'MODERATE', 'SEVERE', 'CATASTROPHIC');
ALTER TABLE "ai_assessments" ALTER COLUMN "damageSeverity" TYPE "DamageSeverity_new" USING ("damageSeverity"::text::"DamageSeverity_new");
ALTER TYPE "DamageSeverity" RENAME TO "DamageSeverity_old";
ALTER TYPE "DamageSeverity_new" RENAME TO "DamageSeverity";
DROP TYPE "DamageSeverity_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "DocumentType_new" AS ENUM ('MEDICAL_RECORD', 'REFERRAL_LETTER', 'DENTAL_XRAY', 'TREATMENT_PLAN', 'INVOICE', 'EXPLANATION_OF_BENEFITS', 'INSURANCE_CARD', 'WITNESS_STATEMENT', 'OTHER');
ALTER TABLE "documents" ALTER COLUMN "type" TYPE "DocumentType_new" USING ("type"::text::"DocumentType_new");
ALTER TYPE "DocumentType" RENAME TO "DocumentType_old";
ALTER TYPE "DocumentType_new" RENAME TO "DocumentType";
DROP TYPE "DocumentType_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "IncidentType_new" AS ENUM ('PHYSIOTHERAPY', 'MASSAGE_THERAPY', 'CHIROPRACTIC', 'PSYCHOLOGIST', 'DENTAL_PREVENTIVE', 'DENTAL_RESTORATIVE', 'VISION_CARE');
ALTER TABLE "claims" ALTER COLUMN "incidentType" TYPE "IncidentType_new" USING ("incidentType"::text::"IncidentType_new");
ALTER TYPE "IncidentType" RENAME TO "IncidentType_old";
ALTER TYPE "IncidentType_new" RENAME TO "IncidentType";
DROP TYPE "IncidentType_old";
COMMIT;

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'CLIENT';

-- AlterTable
ALTER TABLE "ai_assessments" DROP COLUMN "estimatedRepairCost",
ADD COLUMN     "estimatedTreatmentCost" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "claims" ADD COLUMN     "provider" JSONB;

-- AlterTable
ALTER TABLE "policies" ADD COLUMN     "clientId" TEXT,
ADD COLUMN     "percentCovered" DOUBLE PRECISION NOT NULL DEFAULT 0.8,
ADD COLUMN     "reasonableAndCustomary" JSONB NOT NULL DEFAULT '{}';

-- CreateIndex
CREATE UNIQUE INDEX "policies_clientId_key" ON "policies"("clientId");

-- AddForeignKey
ALTER TABLE "policies" ADD CONSTRAINT "policies_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
