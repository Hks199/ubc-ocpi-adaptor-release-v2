-- CreateTable
CREATE TABLE "beckn_log" (
    "id" TEXT NOT NULL,
    "aiid" BIGSERIAL NOT NULL,
    "domain" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "payload" JSON DEFAULT '{}',
    "additional_props" JSON DEFAULT '{}',
    "created_on" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_on" TIMESTAMP(3) NOT NULL,
    "deleted" BOOLEAN DEFAULT false,
    "deleted_on" TIMESTAMP(3),

    CONSTRAINT "beckn_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "beckn_log_domain_idx" ON "beckn_log"("domain");

-- CreateIndex
CREATE INDEX "beckn_log_action_idx" ON "beckn_log"("action");

-- CreateIndex
CREATE INDEX "beckn_log_transaction_id_idx" ON "beckn_log"("transaction_id");

-- CreateIndex
CREATE INDEX "beckn_log_message_id_idx" ON "beckn_log"("message_id");

-- CreateIndex
CREATE INDEX "beckn_log_domain_action_transaction_id_created_on_idx" ON "beckn_log"("domain", "action", "transaction_id", "created_on" DESC);

-- CreateIndex
CREATE INDEX "beckn_log_created_on_idx" ON "beckn_log"("created_on" DESC);
