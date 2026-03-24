/*
  Warnings:

  - Added the required column `beckn_transaction_id` to the `payment_txn` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "payment_txn" ADD COLUMN     "beckn_transaction_id" TEXT NOT NULL;
