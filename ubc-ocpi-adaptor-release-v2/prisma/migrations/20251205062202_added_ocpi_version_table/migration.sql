/*
  Warnings:

  - You are about to drop the `partner` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `partner_credentials` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `partner_endpoint` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "partner_credentials" DROP CONSTRAINT "partner_credentials_partner_id_fkey";

-- DropForeignKey
ALTER TABLE "partner_endpoint" DROP CONSTRAINT "partner_endpoint_partner_id_fkey";

-- DropTable
DROP TABLE "partner";

-- DropTable
DROP TABLE "partner_credentials";

-- DropTable
DROP TABLE "partner_endpoint";

-- CreateTable
CREATE TABLE "ocpi_partner" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "country_code" TEXT NOT NULL,
    "party_id" TEXT NOT NULL,
    "versions_url" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'INIT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "ocpi_partner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ocpi_partner_credentials" (
    "id" TEXT NOT NULL,
    "partner_id" TEXT NOT NULL,
    "cpo_auth_token" TEXT,
    "emsp_auth_token" TEXT,
    "cpo_url" TEXT,
    "emsp_url" TEXT,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ocpi_partner_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ocpi_partner_endpoint" (
    "id" TEXT NOT NULL,
    "partner_id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ocpi_partner_endpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ocpi_version" (
    "id" TEXT NOT NULL,
    "partner_id" TEXT NOT NULL,
    "version_id" TEXT NOT NULL,
    "version_url" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "ocpi_version_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ocpi_partner_country_code_party_id_idx" ON "ocpi_partner"("country_code", "party_id");

-- CreateIndex
CREATE UNIQUE INDEX "ocpi_partner_credentials_partner_id_key" ON "ocpi_partner_credentials"("partner_id");

-- CreateIndex
CREATE INDEX "ocpi_partner_endpoint_partner_id_idx" ON "ocpi_partner_endpoint"("partner_id");

-- CreateIndex
CREATE INDEX "ocpi_version_partner_id_idx" ON "ocpi_version"("partner_id");

-- AddForeignKey
ALTER TABLE "ocpi_partner_credentials" ADD CONSTRAINT "ocpi_partner_credentials_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "ocpi_partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ocpi_partner_endpoint" ADD CONSTRAINT "ocpi_partner_endpoint_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "ocpi_partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ocpi_version" ADD CONSTRAINT "ocpi_version_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "ocpi_partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
