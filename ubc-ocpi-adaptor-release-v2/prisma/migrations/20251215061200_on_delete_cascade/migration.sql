-- DropForeignKey
ALTER TABLE "payment_txn" DROP CONSTRAINT "payment_txn_partner_id_fkey";

-- DropForeignKey
ALTER TABLE "tariff" DROP CONSTRAINT "tariff_eVSEConnectorId_fkey";

-- AddForeignKey
ALTER TABLE "tariff" ADD CONSTRAINT "tariff_eVSEConnectorId_fkey" FOREIGN KEY ("eVSEConnectorId") REFERENCES "evse_connector"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_txn" ADD CONSTRAINT "payment_txn_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "ocpi_partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
