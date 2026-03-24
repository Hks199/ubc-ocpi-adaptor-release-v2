/*
  Warnings:

  - You are about to drop the column `ocpi_session_id` on the `session` table. All the data in the column will be lost.
  - Added the required column `cpo_session_id` to the `session` table without a default value. This is not possible if the table is not empty.
  - Added the required column `emsp_session_id` to the `session` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "session_country_code_party_id_ocpi_session_id_key";

-- DropIndex
DROP INDEX "session_ocpi_session_id_idx";

-- AlterTable
ALTER TABLE "session" DROP COLUMN "ocpi_session_id",
ADD COLUMN     "cpo_session_id" TEXT NOT NULL,
ADD COLUMN     "emsp_session_id" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "ocpi_log" (
    "id" TEXT NOT NULL,
    "aiid" BIGSERIAL NOT NULL,
    "command" TEXT NOT NULL,
    "payload" JSON NOT NULL,
    "additional_props" JSON DEFAULT '{}',
    "partner_id" TEXT NOT NULL,
    "location_id" TEXT,
    "evse_id" TEXT,
    "connector_id" TEXT,
    "session_id" TEXT,
    "emsp_session_id" TEXT,
    "cpo_session_id" TEXT,
    "created_on" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ocpi_log_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ocpi_log" ADD CONSTRAINT "ocpi_log_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "ocpi_partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ocpi_log" ADD CONSTRAINT "ocpi_log_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ocpi_log" ADD CONSTRAINT "ocpi_log_evse_id_fkey" FOREIGN KEY ("evse_id") REFERENCES "evse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ocpi_log" ADD CONSTRAINT "ocpi_log_connector_id_fkey" FOREIGN KEY ("connector_id") REFERENCES "evse_connector"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ocpi_log" ADD CONSTRAINT "ocpi_log_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ocpi_log" ADD CONSTRAINT "ocpi_log_emsp_session_id_fkey" FOREIGN KEY ("emsp_session_id") REFERENCES "session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ocpi_log" ADD CONSTRAINT "ocpi_log_cpo_session_id_fkey" FOREIGN KEY ("cpo_session_id") REFERENCES "session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
