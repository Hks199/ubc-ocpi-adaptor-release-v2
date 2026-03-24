/*
  Warnings:

  - You are about to drop the column `tariff_ids` on the `evse_connector` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "evse_connector" DROP COLUMN "tariff_ids";

-- AlterTable
ALTER TABLE "tariff" ADD COLUMN     "evse_connector_id" TEXT;

-- AddForeignKey
ALTER TABLE "tariff" ADD CONSTRAINT "tariff_evse_connector_id_fkey" FOREIGN KEY ("evse_connector_id") REFERENCES "evse_connector"("id") ON DELETE SET NULL ON UPDATE CASCADE;
