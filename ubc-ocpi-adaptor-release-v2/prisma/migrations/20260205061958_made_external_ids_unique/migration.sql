/*
  Warnings:

  - A unique constraint covering the columns `[external_object_id]` on the table `evse` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[external_object_id]` on the table `location` will be added. If there are existing duplicate values, this will fail.
  - Made the column `external_object_id` on table `evse` required. This step will fail if there are existing NULL values in that column.
  - Made the column `beckn_connector_id` on table `evse_connector` required. This step will fail if there are existing NULL values in that column.
  - Made the column `external_object_id` on table `location` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "evse" ALTER COLUMN "external_object_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "evse_connector" ALTER COLUMN "beckn_connector_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "location" ALTER COLUMN "external_object_id" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "evse_external_object_id_key" ON "evse"("external_object_id");

-- CreateIndex
CREATE UNIQUE INDEX "location_external_object_id_key" ON "location"("external_object_id");
