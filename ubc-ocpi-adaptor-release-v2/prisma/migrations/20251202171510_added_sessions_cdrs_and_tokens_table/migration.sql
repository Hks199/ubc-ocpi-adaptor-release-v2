-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "country_code" TEXT NOT NULL,
    "party_id" TEXT NOT NULL,
    "ocpi_session_id" TEXT NOT NULL,
    "start_date_time" TIMESTAMP(3) NOT NULL,
    "end_date_time" TIMESTAMP(3),
    "kwh" DECIMAL(10,3) NOT NULL,
    "cdr_token" JSONB NOT NULL,
    "auth_method" TEXT NOT NULL,
    "authorization_reference" TEXT,
    "location_id" TEXT NOT NULL,
    "evse_uid" TEXT NOT NULL,
    "connector_id" TEXT NOT NULL,
    "meter_id" TEXT,
    "currency" TEXT NOT NULL,
    "charging_periods" JSONB,
    "total_cost" JSONB,
    "status" TEXT NOT NULL,
    "last_updated" TIMESTAMP(3) NOT NULL,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cdr" (
    "id" TEXT NOT NULL,
    "country_code" TEXT NOT NULL,
    "party_id" TEXT NOT NULL,
    "ocpi_cdr_id" TEXT NOT NULL,
    "start_date_time" TIMESTAMP(3) NOT NULL,
    "end_date_time" TIMESTAMP(3) NOT NULL,
    "session_id" TEXT,
    "cdr_token" JSONB NOT NULL,
    "auth_method" TEXT NOT NULL,
    "authorization_reference" TEXT,
    "cdr_location" JSONB NOT NULL,
    "meter_id" TEXT,
    "currency" TEXT NOT NULL,
    "tariffs" JSONB,
    "charging_periods" JSONB NOT NULL,
    "signed_data" JSONB,
    "total_cost" JSONB NOT NULL,
    "total_fixed_cost" JSONB,
    "total_energy" DECIMAL(10,3) NOT NULL,
    "total_energy_cost" JSONB,
    "total_time" BIGINT NOT NULL,
    "total_time_cost" JSONB,
    "total_parking_time" BIGINT,
    "total_parking_cost" JSONB,
    "total_reservation_cost" JSONB,
    "remark" TEXT,
    "invoice_reference_id" TEXT,
    "credit" BOOLEAN,
    "credit_reference_id" TEXT,
    "remarks" TEXT,
    "last_updated" TIMESTAMP(3) NOT NULL,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cdr_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "token" (
    "id" TEXT NOT NULL,
    "country_code" TEXT NOT NULL,
    "party_id" TEXT NOT NULL,
    "uid" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "contract_id" TEXT NOT NULL,
    "visual_number" TEXT,
    "issuer" TEXT NOT NULL,
    "group_id" TEXT,
    "valid" BOOLEAN NOT NULL,
    "whitelist" TEXT NOT NULL,
    "language" TEXT,
    "default_profile_type" TEXT,
    "energy_contract" JSONB,
    "last_updated" TIMESTAMP(3) NOT NULL,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "token_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "session_country_code_party_id_idx" ON "session"("country_code", "party_id");

-- CreateIndex
CREATE INDEX "session_ocpi_session_id_idx" ON "session"("ocpi_session_id");

-- CreateIndex
CREATE INDEX "session_location_id_idx" ON "session"("location_id");

-- CreateIndex
CREATE INDEX "session_status_idx" ON "session"("status");

-- CreateIndex
CREATE UNIQUE INDEX "session_country_code_party_id_ocpi_session_id_key" ON "session"("country_code", "party_id", "ocpi_session_id");

-- CreateIndex
CREATE INDEX "cdr_country_code_party_id_idx" ON "cdr"("country_code", "party_id");

-- CreateIndex
CREATE INDEX "cdr_ocpi_cdr_id_idx" ON "cdr"("ocpi_cdr_id");

-- CreateIndex
CREATE INDEX "cdr_session_id_idx" ON "cdr"("session_id");

-- CreateIndex
CREATE INDEX "cdr_currency_idx" ON "cdr"("currency");

-- CreateIndex
CREATE UNIQUE INDEX "cdr_country_code_party_id_ocpi_cdr_id_key" ON "cdr"("country_code", "party_id", "ocpi_cdr_id");

-- CreateIndex
CREATE INDEX "token_country_code_party_id_idx" ON "token"("country_code", "party_id");

-- CreateIndex
CREATE INDEX "token_uid_idx" ON "token"("uid");

-- CreateIndex
CREATE INDEX "token_contract_id_idx" ON "token"("contract_id");

-- CreateIndex
CREATE INDEX "token_valid_idx" ON "token"("valid");

-- CreateIndex
CREATE UNIQUE INDEX "token_country_code_party_id_uid_key" ON "token"("country_code", "party_id", "uid");
