-- AlterTable
ALTER TABLE "payment_txn" ADD COLUMN     "details" JSON DEFAULT '{}',
ADD COLUMN     "payment_gateway_order_id" TEXT,
ADD COLUMN     "payment_gateway_payment_id" TEXT;

-- CreateIndex
CREATE INDEX "payment_txn_payment_gateway_order_id_idx" ON "payment_txn"("payment_gateway_order_id");
