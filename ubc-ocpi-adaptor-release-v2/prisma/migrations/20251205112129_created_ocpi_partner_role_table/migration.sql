/*
  Warnings:

  - You are about to drop the column `role` on the `ocpi_partner` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[country_code,party_id]` on the table `ocpi_partner` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "ocpi_partner_country_code_party_id_idx";

-- AlterTable
ALTER TABLE "ocpi_partner" DROP COLUMN "role";

-- CreateTable
CREATE TABLE "ocpi_partner_role" (
    "id" TEXT NOT NULL,
    "partner_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "country_code" TEXT NOT NULL,
    "party_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ocpi_partner_role_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ocpi_partner_country_code_party_id_key" ON "ocpi_partner"("country_code", "party_id");

-- AddForeignKey
ALTER TABLE "ocpi_partner_role" ADD CONSTRAINT "ocpi_partner_role_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "ocpi_partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
