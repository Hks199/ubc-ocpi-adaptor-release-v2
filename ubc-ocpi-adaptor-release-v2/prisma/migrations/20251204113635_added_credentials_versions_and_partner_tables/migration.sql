-- CreateTable
CREATE TABLE "partner" (
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

    CONSTRAINT "partner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_credentials" (
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

    CONSTRAINT "partner_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_endpoint" (
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

    CONSTRAINT "partner_endpoint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "partner_country_code_party_id_idx" ON "partner"("country_code", "party_id");

-- CreateIndex
CREATE UNIQUE INDEX "partner_credentials_partner_id_key" ON "partner_credentials"("partner_id");

-- CreateIndex
CREATE INDEX "partner_endpoint_partner_id_idx" ON "partner_endpoint"("partner_id");

-- AddForeignKey
ALTER TABLE "partner_credentials" ADD CONSTRAINT "partner_credentials_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_endpoint" ADD CONSTRAINT "partner_endpoint_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
