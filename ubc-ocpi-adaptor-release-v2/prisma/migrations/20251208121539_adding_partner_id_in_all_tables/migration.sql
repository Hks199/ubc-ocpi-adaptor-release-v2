/*
  Warnings:

  - You are about to drop the `ocpi_partner_role` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `partner_id` to the `cdr` table without a default value. This is not possible if the table is not empty.
  - Added the required column `partner_id` to the `evse` table without a default value. This is not possible if the table is not empty.
  - Added the required column `partner_id` to the `evse_connector` table without a default value. This is not possible if the table is not empty.
  - Added the required column `partner_id` to the `location` table without a default value. This is not possible if the table is not empty.
  - Added the required column `partner_id` to the `session` table without a default value. This is not possible if the table is not empty.
  - Added the required column `partner_id` to the `tariff` table without a default value. This is not possible if the table is not empty.
  - Added the required column `partner_id` to the `token` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "ocpi_partner_role" DROP CONSTRAINT "ocpi_partner_role_partner_id_fkey";

-- AlterTable
ALTER TABLE "cdr" ADD COLUMN     "partner_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "evse" ADD COLUMN     "partner_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "evse_connector" ADD COLUMN     "partner_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "location" ADD COLUMN     "partner_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "ocpi_partner" ADD COLUMN     "role" TEXT NOT NULL DEFAULT 'CPO';

-- AlterTable
ALTER TABLE "session" ADD COLUMN     "partner_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "tariff" ADD COLUMN     "partner_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "token" ADD COLUMN     "partner_id" TEXT NOT NULL;

-- DropTable
DROP TABLE "ocpi_partner_role";

-- CreateIndex
CREATE INDEX "cdr_partner_id_idx" ON "cdr"("partner_id");

-- CreateIndex
CREATE INDEX "evse_connector_partner_id_idx" ON "evse_connector"("partner_id");

-- CreateIndex
CREATE INDEX "location_partner_id_idx" ON "location"("partner_id");

-- CreateIndex
CREATE INDEX "session_partner_id_idx" ON "session"("partner_id");

-- CreateIndex
CREATE INDEX "tariff_partner_id_idx" ON "tariff"("partner_id");

-- CreateIndex
CREATE INDEX "token_partner_id_idx" ON "token"("partner_id");

-- AddForeignKey
ALTER TABLE "location" ADD CONSTRAINT "location_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "ocpi_partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evse" ADD CONSTRAINT "evse_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "ocpi_partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evse_connector" ADD CONSTRAINT "evse_connector_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "ocpi_partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tariff" ADD CONSTRAINT "tariff_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "ocpi_partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "ocpi_partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cdr" ADD CONSTRAINT "cdr_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "ocpi_partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "token" ADD CONSTRAINT "token_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "ocpi_partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
