-- DropIndex
DROP INDEX "cdr_currency_idx";

-- DropIndex
DROP INDEX "cdr_session_id_idx";

-- DropIndex
DROP INDEX "evse_uid_idx";

-- DropIndex
DROP INDEX "location_country_code_party_id_idx";

-- DropIndex
DROP INDEX "token_contract_id_idx";

-- DropIndex
DROP INDEX "token_valid_idx";

-- CreateIndex
CREATE INDEX "cdr_partner_id_last_updated_idx" ON "cdr"("partner_id", "last_updated" DESC);

-- CreateIndex
CREATE INDEX "evse_connector_connector_id_idx" ON "evse_connector"("connector_id");

-- CreateIndex
CREATE INDEX "location_ocpi_location_id_partner_id_idx" ON "location"("ocpi_location_id", "partner_id");

-- CreateIndex
CREATE INDEX "ocpi_log_partner_id_created_on_idx" ON "ocpi_log"("partner_id", "created_on" DESC);

-- CreateIndex
CREATE INDEX "ocpi_log_command_idx" ON "ocpi_log"("command");

-- CreateIndex
CREATE INDEX "ocpi_log_sender_type_idx" ON "ocpi_log"("sender_type");

-- CreateIndex
CREATE INDEX "ocpi_partner_role_deleted_idx" ON "ocpi_partner"("role", "deleted");

-- CreateIndex
CREATE INDEX "ocpi_partner_credentials_cpo_auth_token_idx" ON "ocpi_partner_credentials"("cpo_auth_token");

-- CreateIndex
CREATE INDEX "ocpi_partner_credentials_emsp_auth_token_idx" ON "ocpi_partner_credentials"("emsp_auth_token");

-- CreateIndex
CREATE INDEX "ocpi_partner_endpoint_partner_id_module_role_version_idx" ON "ocpi_partner_endpoint"("partner_id", "module", "role", "version");

-- CreateIndex
CREATE INDEX "session_authorization_reference_partner_id_idx" ON "session"("authorization_reference", "partner_id");

-- CreateIndex
CREATE INDEX "session_cpo_session_id_partner_id_idx" ON "session"("cpo_session_id", "partner_id");

-- CreateIndex
CREATE INDEX "session_partner_id_last_updated_idx" ON "session"("partner_id", "last_updated" DESC);

-- CreateIndex
CREATE INDEX "tariff_partner_id_country_code_party_id_idx" ON "tariff"("partner_id", "country_code", "party_id");

-- CreateIndex
CREATE INDEX "token_partner_id_last_updated_idx" ON "token"("partner_id", "last_updated" DESC);
