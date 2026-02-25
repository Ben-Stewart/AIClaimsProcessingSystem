-- AlterTable
-- Note: the table is still named "settlement_recommendations" at this point in the migration sequence.
-- It is renamed to "reimbursement_recommendations" in the next migration (20260225200000).
ALTER TABLE "settlement_recommendations" RENAME CONSTRAINT "settlement_recommendations_pkey" TO "reimbursement_recommendations_pkey";

-- RenameForeignKey
ALTER TABLE "settlement_recommendations" RENAME CONSTRAINT "settlement_recommendations_claimId_fkey" TO "reimbursement_recommendations_claimId_fkey";

-- RenameIndex
ALTER INDEX "settlement_recommendations_claimId_key" RENAME TO "reimbursement_recommendations_claimId_key";
