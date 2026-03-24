/*
  Warnings:

  - A unique constraint covering the columns `[beckn_connector_id]` on the table `evse_connector` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "evse_connector_beckn_connector_id_key" ON "evse_connector"("beckn_connector_id");

-- CreateIndex
CREATE INDEX "evse_connector_beckn_connector_id_idx" ON "evse_connector"("beckn_connector_id");
