/*
  Warnings:

  - You are about to drop the column `evse_connector_id` on the `tariff` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "tariff" DROP CONSTRAINT "tariff_evse_connector_id_fkey";

-- AlterTable
ALTER TABLE "evse_connector" ADD COLUMN     "tariffId" TEXT,
ADD COLUMN     "tariff_id" TEXT;

-- AlterTable
ALTER TABLE "tariff" DROP COLUMN "evse_connector_id";

-- AddForeignKey
ALTER TABLE "evse_connector" ADD CONSTRAINT "evse_connector_tariff_id_fkey" FOREIGN KEY ("tariff_id") REFERENCES "tariff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
