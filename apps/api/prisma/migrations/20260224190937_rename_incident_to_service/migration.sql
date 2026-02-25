/*
  Warnings:

  - You are about to drop the column `incidentDate` on the `claims` table. All the data in the column will be lost.
  - You are about to drop the column `incidentDescription` on the `claims` table. All the data in the column will be lost.
  - You are about to drop the column `incidentType` on the `claims` table. All the data in the column will be lost.
  - Added the required column `serviceDate` to the `claims` table without a default value. This is not possible if the table is not empty.
  - Added the required column `serviceDescription` to the `claims` table without a default value. This is not possible if the table is not empty.
  - Added the required column `serviceType` to the `claims` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "ServiceType" AS ENUM ('PHYSIOTHERAPY', 'MASSAGE_THERAPY', 'CHIROPRACTIC', 'PSYCHOLOGIST', 'DENTAL_PREVENTIVE', 'DENTAL_RESTORATIVE', 'VISION_CARE');

-- AlterTable
ALTER TABLE "claims" DROP COLUMN "incidentDate",
DROP COLUMN "incidentDescription",
DROP COLUMN "incidentType",
ADD COLUMN     "serviceDate" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "serviceDescription" TEXT NOT NULL,
ADD COLUMN     "serviceType" "ServiceType" NOT NULL;

-- DropEnum
DROP TYPE "IncidentType";
