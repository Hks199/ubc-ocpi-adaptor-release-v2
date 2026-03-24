-- CreateTable
CREATE TABLE "location" (
    "id" TEXT NOT NULL,
    "ocpi_location_id" TEXT NOT NULL,
    "name" TEXT,
    "latitude" TEXT NOT NULL,
    "longitude" TEXT NOT NULL,
    "country_code" TEXT NOT NULL,
    "party_id" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "postal_code" TEXT,
    "state" TEXT,
    "country" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "time_zone" TEXT NOT NULL,
    "parking_type" TEXT,
    "related_locations" JSONB,
    "directions" JSONB,
    "operator" JSONB,
    "suboperator" JSONB,
    "owner" JSONB,
    "facilities" TEXT[],
    "opening_times" JSONB,
    "images" JSONB,
    "energy_mix" JSONB,
    "charging_when_closed" BOOLEAN,
    "publish" BOOLEAN NOT NULL DEFAULT false,
    "publish_allowed_to" JSONB,
    "last_updated" TIMESTAMP(3) NOT NULL,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evse" (
    "id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "uid" TEXT NOT NULL,
    "evse_id" TEXT,
    "status" TEXT NOT NULL,
    "status_schedule" JSONB,
    "capabilities" TEXT[],
    "floor_level" TEXT,
    "latitude" TEXT,
    "longitude" TEXT,
    "physical_reference" TEXT,
    "directions" JSONB,
    "parking_restrictions" TEXT[],
    "images" JSONB,
    "status_errorcode" TEXT,
    "status_errordescription" TEXT,
    "last_updated" TIMESTAMP(3) NOT NULL,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "evse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evse_connector" (
    "id" TEXT NOT NULL,
    "evse_id" TEXT NOT NULL,
    "connector_id" TEXT NOT NULL,
    "standard" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "qr_code" TEXT,
    "power_type" TEXT NOT NULL,
    "max_voltage" BIGINT NOT NULL,
    "max_amperage" BIGINT NOT NULL,
    "max_electric_power" BIGINT,
    "tariff_ids" TEXT[],
    "terms_and_conditions" TEXT,
    "last_updated" TIMESTAMP(3) NOT NULL,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "evse_connector_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tariff" (
    "id" TEXT NOT NULL,
    "country_code" TEXT NOT NULL,
    "party_id" TEXT NOT NULL,
    "ocpi_tariff_id" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "type" TEXT,
    "tariff_alt_text" JSONB,
    "tariff_alt_url" TEXT,
    "min_price" JSONB,
    "max_price" JSONB,
    "start_date_time" TIMESTAMP(3),
    "end_date_time" TIMESTAMP(3),
    "energy_mix" JSONB,
    "last_updated" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "ocpi_tariff_element" JSONB,

    CONSTRAINT "tariff_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "location_country_code_party_id_idx" ON "location"("country_code", "party_id");

-- CreateIndex
CREATE UNIQUE INDEX "location_country_code_party_id_key" ON "location"("country_code", "party_id");

-- CreateIndex
CREATE INDEX "evse_uid_idx" ON "evse"("uid");

-- CreateIndex
CREATE INDEX "evse_location_id_idx" ON "evse"("location_id");

-- CreateIndex
CREATE UNIQUE INDEX "evse_location_id_uid_key" ON "evse"("location_id", "uid");

-- CreateIndex
CREATE INDEX "evse_connector_evse_id_idx" ON "evse_connector"("evse_id");

-- CreateIndex
CREATE UNIQUE INDEX "evse_connector_evse_id_connector_id_key" ON "evse_connector"("evse_id", "connector_id");

-- CreateIndex
CREATE INDEX "tariff_country_code_party_id_idx" ON "tariff"("country_code", "party_id");

-- CreateIndex
CREATE INDEX "tariff_ocpi_tariff_id_idx" ON "tariff"("ocpi_tariff_id");

-- CreateIndex
CREATE UNIQUE INDEX "tariff_country_code_party_id_ocpi_tariff_id_key" ON "tariff"("country_code", "party_id", "ocpi_tariff_id");

-- AddForeignKey
ALTER TABLE "evse" ADD CONSTRAINT "evse_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evse_connector" ADD CONSTRAINT "evse_connector_evse_id_fkey" FOREIGN KEY ("evse_id") REFERENCES "evse"("id") ON DELETE CASCADE ON UPDATE CASCADE;
