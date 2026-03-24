/*
  Warnings:

  - You are about to drop the column `emsp_session_id` on the `ocpi_log` table. All the data in the column will be lost.
  - You are about to drop the column `emsp_session_id` on the `session` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "ocpi_log" DROP CONSTRAINT "ocpi_log_emsp_session_id_fkey";

-- AlterTable
ALTER TABLE "ocpi_log" DROP COLUMN "emsp_session_id",
ADD COLUMN     "authorization_reference" TEXT;

-- AlterTable
ALTER TABLE "session" DROP COLUMN "emsp_session_id";

-- CreateTable
CREATE TABLE "payment_txn" (
    "id" TEXT NOT NULL,
    "authorization_reference" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "payment_link" TEXT NOT NULL,
    "payment_breakdown" JSON NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL,
    "requested_energy_units" DECIMAL(10,3) NOT NULL,
    "partner_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "payment_txn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payment_txn_authorization_reference_idx" ON "payment_txn"("authorization_reference");

-- CreateIndex
CREATE INDEX "payment_txn_partner_id_idx" ON "payment_txn"("partner_id");

-- AddForeignKey
ALTER TABLE "ocpi_log" ADD CONSTRAINT "ocpi_log_authorization_reference_fkey" FOREIGN KEY ("authorization_reference") REFERENCES "session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_txn" ADD CONSTRAINT "payment_txn_authorization_reference_fkey" FOREIGN KEY ("authorization_reference") REFERENCES "session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_txn" ADD CONSTRAINT "payment_txn_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "ocpi_partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
