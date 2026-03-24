/*
  Warnings:

  - You are about to drop the column `tariffId` on the `evse_connector` table. All the data in the column will be lost.
  - You are about to drop the column `tariff_id` on the `evse_connector` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "evse_connector" DROP CONSTRAINT "evse_connector_tariff_id_fkey";

-- AlterTable
ALTER TABLE "evse_connector" DROP COLUMN "tariffId",
DROP COLUMN "tariff_id",
ADD COLUMN     "tariff_ids" TEXT[];

-- AlterTable
ALTER TABLE "tariff" ADD COLUMN     "eVSEConnectorId" TEXT;

-- AddForeignKey
ALTER TABLE "tariff" ADD CONSTRAINT "tariff_eVSEConnectorId_fkey" FOREIGN KEY ("eVSEConnectorId") REFERENCES "evse_connector"("id") ON DELETE SET NULL ON UPDATE CASCADE;
