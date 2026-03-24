-- AlterTable
ALTER TABLE "payment_txn" ADD COLUMN     "beneficiary" TEXT;

-- AlterTable
ALTER TABLE "session" ADD COLUMN     "final_amount" JSONB NOT NULL DEFAULT '{}';
