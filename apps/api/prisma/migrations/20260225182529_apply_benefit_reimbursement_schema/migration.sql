-- AlterTable
ALTER TABLE "reimbursement_recommendations" RENAME CONSTRAINT "settlement_recommendations_pkey" TO "reimbursement_recommendations_pkey";

-- RenameForeignKey
ALTER TABLE "reimbursement_recommendations" RENAME CONSTRAINT "settlement_recommendations_claimId_fkey" TO "reimbursement_recommendations_claimId_fkey";

-- RenameIndex
ALTER INDEX "settlement_recommendations_claimId_key" RENAME TO "reimbursement_recommendations_claimId_key";
