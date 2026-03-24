/*
  Warnings:

  - A unique constraint covering the columns `[country_code,party_id,ocpi_location_id]` on the table `location` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "location_country_code_party_id_key";

-- CreateIndex
CREATE UNIQUE INDEX "location_country_code_party_id_ocpi_location_id_key" ON "location"("country_code", "party_id", "ocpi_location_id");
