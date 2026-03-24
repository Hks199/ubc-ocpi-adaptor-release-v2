-- AlterTable
ALTER TABLE "payment_txn" ADD COLUMN     "service_charge" JSON NOT NULL DEFAULT '{}';
